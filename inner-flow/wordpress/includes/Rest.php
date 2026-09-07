<?php
/**
 * REST 路由與背景推進機制。
 *
 * 共享主機上最容易壞的兩件事，這裡各有對策：
 *  1. 執行時間限制 → 每個請求只生成一段，絕不在單一請求裡跑完整份報告。
 *  2. loopback 請求或 WP-Cron 被主機停用 → 前端輪詢時若發現任務卡住，
 *     由輪詢本身把它推下去。三條推進路徑只要有一條活著，報告就會完成。
 *
 * @package InnerFlow
 */

namespace InnerFlow;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class Rest {

	const NAMESPACE_V1 = 'inner-flow/v1';
	const CRON_HOOK    = 'inner_flow_work';

	/** 建立報告的速率限制：每個 IP 每小時最多幾次。 */
	const CREATE_PER_HOUR = 20;

	public static function register() {
		register_rest_route(
			self::NAMESPACE_V1,
			'/health',
			array(
				'methods'             => 'GET',
				'permission_callback' => '__return_true',
				'callback'            => array( __CLASS__, 'health' ),
			)
		);

		register_rest_route(
			self::NAMESPACE_V1,
			'/report',
			array(
				'methods'             => 'POST',
				'permission_callback' => '__return_true',
				'callback'            => array( __CLASS__, 'create' ),
			)
		);

		register_rest_route(
			self::NAMESPACE_V1,
			'/report/(?P<job>[a-z0-9]{16,40})',
			array(
				'methods'             => 'GET',
				'permission_callback' => '__return_true',
				'callback'            => array( __CLASS__, 'status' ),
			)
		);

		// 由 loopback 請求或 WP-Cron 觸發，以 HMAC 權杖保護。
		register_rest_route(
			self::NAMESPACE_V1,
			'/work',
			array(
				'methods'             => 'POST',
				'permission_callback' => '__return_true',
				'callback'            => array( __CLASS__, 'work' ),
			)
		);
	}

	/**
	 * 掛載狀態：讓你部署後先確認設定，而不是等使用者按下生成才發現。
	 */
	public static function health( $request ) {
		return self::no_cache(
			array(
				'status'            => 'ok',
				'model'             => Plugin::model(),
				'api_key_set'       => '' !== Plugin::api_key(),      // 只回報有沒有設定
				'gumroad_product'   => '' !== Plugin::gumroad_product_id(),
				'steps_per_report'  => Jobs::total_steps(),
				'plugin_version'    => INNER_FLOW_VERSION,
			)
		);
	}

	/**
	 * 購買後生成：先驗證 Gumroad 授權碼，再建立任務並立刻推進第一步。
	 */
	public static function create( $request ) {
		if ( ! self::within_rate_limit() ) {
			return new \WP_Error( 'inner_flow_rate_limited', '請求過於頻繁，請稍後再試。', array( 'status' => 429 ) );
		}

		$body    = $request->get_json_params();
		$license = isset( $body['license'] ) ? sanitize_text_field( $body['license'] ) : '';

		$verification = Plugin::gumroad()->verify( $license );
		if ( ! $verification['valid'] ) {
			return new \WP_Error( 'inner_flow_invalid_license', $verification['reason'], array( 'status' => 402 ) );
		}

		$result = self::sanitize_result( $body );
		if ( is_wp_error( $result ) ) {
			return $result;
		}

		$jobs    = Plugin::jobs();
		$outcome = $jobs->create_or_get( $license, $result );
		if ( '' !== $outcome['error'] ) {
			return new \WP_Error( 'inner_flow_limit', $outcome['error'], array( 'status' => 403 ) );
		}

		$job = $outcome['job'];
		self::kick( $job['job_key'] );

		return self::no_cache( Jobs::progress( $job ) );
	}

	/**
	 * 輪詢：回傳進度與「已經寫好的章節」，讓報告逐章浮現。
	 * 順帶擔任守門員——發現任務卡住就親自推一把。
	 */
	public static function status( $request ) {
		$job = Plugin::store()->find( $request['job'] );
		if ( ! $job ) {
			return new \WP_Error( 'inner_flow_not_found', '找不到這份報告。', array( 'status' => 404 ) );
		}

		if ( Jobs::is_stalled( $job, time() ) ) {
			self::kick( $job['job_key'] );
		}

		$progress          = Jobs::progress( $job );
		$progress['pages'] = ReportBuilder::estimate_pages( $job );
		if ( Jobs::STATUS_FAILED === $job['status'] ) {
			// 內部錯誤訊息只寫進紀錄，不回傳給使用者
			$progress['error'] = '生成過程中斷了，我們已經收到通知。請重新整理再試一次。';
		}

		return self::no_cache( $progress );
	}

	/**
	 * 背景工作：生成一段，然後把下一段排進去。
	 */
	public static function work( $request ) {
		$job_key = sanitize_text_field( (string) $request->get_param( 'job' ) );
		$token   = (string) $request->get_param( 'token' );

		if ( ! hash_equals( self::token( $job_key ), $token ) ) {
			return new \WP_Error( 'inner_flow_forbidden', '權杖無效。', array( 'status' => 403 ) );
		}

		self::run( $job_key );
		return self::no_cache( array( 'ok' => true ) );
	}

	/**
	 * 實際執行一步，並在還沒完成時繼續推進。
	 * 使用者關掉瀏覽器也要跑完，因此忽略連線中斷。
	 *
	 * @param string $job_key 任務金鑰。
	 */
	public static function run( $job_key ) {
		ignore_user_abort( true );
		if ( function_exists( 'set_time_limit' ) ) {
			@set_time_limit( 120 );
		}

		$outcome = Plugin::jobs()->step( $job_key );

		if ( ! $outcome['done'] && ! $outcome['skipped'] && Jobs::STATUS_FAILED !== $outcome['status'] ) {
			self::kick( $job_key );
		}
	}

	/**
	 * 觸發下一步。三條路徑同時安排，任何一條活著就能完成：
	 *  1. 非阻塞 loopback 請求（最快，多數主機可用）
	 *  2. WP-Cron 單次事件（loopback 被擋時的後備）
	 *  3. 前端輪詢時的自我修復（見 status()）
	 *
	 * @param string $job_key 任務金鑰。
	 */
	public static function kick( $job_key ) {
		wp_remote_post(
			rest_url( self::NAMESPACE_V1 . '/work' ),
			array(
				'timeout'   => 0.01,
				'blocking'  => false,
				'sslverify' => false,   // 本機 loopback，部分主機的自簽憑證會失敗
				'body'      => array( 'job' => $job_key, 'token' => self::token( $job_key ) ),
			)
		);

		if ( ! wp_next_scheduled( self::CRON_HOOK, array( $job_key ) ) ) {
			wp_schedule_single_event( time() + 30, self::CRON_HOOK, array( $job_key ) );
		}
	}

	/**
	 * @param string $job_key 任務金鑰。
	 * @return string
	 */
	public static function token( $job_key ) {
		return hash_hmac( 'sha256', 'inner-flow-work|' . $job_key, wp_salt( 'auth' ) );
	}

	/**
	 * 驗證並清理前端送來的評估結果。
	 *
	 * @param array $body 請求內容。
	 * @return array|\WP_Error
	 */
	private static function sanitize_result( $body ) {
		$fields = array( 'entropy', 'boundary', 'flow', 'work' );
		$result = array();

		foreach ( $fields as $field ) {
			$value = isset( $body[ $field ] ) ? $body[ $field ] : null;
			if ( ! is_numeric( $value ) || $value < 0 || $value > 100 ) {
				return new \WP_Error( 'inner_flow_bad_request', $field . ' 必須是 0 到 100 之間的數字。', array( 'status' => 400 ) );
			}
			$result[ $field ] = (int) round( $value );
		}

		$code = isset( $body['code'] ) ? sanitize_text_field( $body['code'] ) : '';
		if ( ! preg_match( '/^[1-4]{6}$/', $code ) ) {
			return new \WP_Error( 'inner_flow_bad_request', '答案碼格式不正確。', array( 'status' => 400 ) );
		}

		$result['code']       = $code;
		$result['archetype']  = mb_substr( sanitize_text_field( isset( $body['archetype'] ) ? $body['archetype'] : '' ), 0, 120 );
		$result['band']       = mb_substr( sanitize_text_field( isset( $body['band'] ) ? $body['band'] : '' ), 0, 40 );
		$result['bottleneck'] = mb_substr( sanitize_text_field( isset( $body['bottleneck'] ) ? $body['bottleneck'] : '無明顯瓶頸' ), 0, 40 );

		if ( '' === $result['archetype'] ) {
			return new \WP_Error( 'inner_flow_bad_request', '缺少能量原型。', array( 'status' => 400 ) );
		}

		return $result;
	}

	/**
	 * 快取外掛常會把 REST 回應也快取起來，那會讓輪詢永遠看到同一個進度。
	 *
	 * @param array $data 回應內容。
	 * @return \WP_REST_Response
	 */
	private static function no_cache( array $data ) {
		$response = rest_ensure_response( $data );
		$response->header( 'Cache-Control', 'no-store, max-age=0' );
		return $response;
	}

	/**
	 * @return bool
	 */
	private static function within_rate_limit() {
		$ip  = isset( $_SERVER['REMOTE_ADDR'] ) ? sanitize_text_field( wp_unslash( $_SERVER['REMOTE_ADDR'] ) ) : 'unknown';
		$key = 'inner_flow_rl_' . md5( $ip );

		$count = (int) get_transient( $key );
		if ( $count >= self::CREATE_PER_HOUR ) {
			return false;
		}
		set_transient( $key, $count + 1, HOUR_IN_SECONDS );
		return true;
	}
}
