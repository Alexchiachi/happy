<?php
/**
 * 報告生成的狀態機。
 *
 * 為什麼要拆成一步一步：共享主機的 max_execution_time 常見只有 30–60 秒，
 * 前面若有 Cloudflare 還有約 100 秒的閘道逾時。整份報告一次生成需要 1–2 分鐘，
 * 同步請求必定中斷——而且是在使用者付完錢之後中斷。
 *
 * 因此每一次 worker 只生成「一段」（五章 + 一段寄語，共六步），
 * 每步約 20–30 秒，穩穩落在任何主機的限制之內。前端輪詢時逐章顯示，
 * 兩分鐘的等待因此是有進度感的等待。
 *
 * @package InnerFlow
 */

namespace InnerFlow;

if ( ! defined( 'ABSPATH' ) && ! defined( 'INNER_FLOW_TEST' ) ) {
	exit;
}

class Jobs {

	const STATUS_QUEUED     = 'queued';
	const STATUS_PROCESSING = 'processing';
	const STATUS_DONE       = 'done';
	const STATUS_FAILED     = 'failed';

	/** 一組授權碼最多可生成幾份不同的報告（重測後可再生成，但不能無限）。 */
	const MAX_PER_LICENSE = 3;

	/** 單一步驟最多重試幾次（含品質不合格的重寫）。 */
	const MAX_ATTEMPTS = 3;

	/** 超過這個秒數沒有進度，就視為卡住，允許其他行程接手。 */
	const STALE_SECONDS = 120;

	/** @var Store */
	private $store;

	/** @var DeepSeek */
	private $client;

	/** @var callable */
	private $clock;

	/**
	 * @param Store    $store  任務儲存。
	 * @param DeepSeek $client 模型用戶端。
	 * @param callable $clock  取得現在時間的函式（測試可注入）。
	 */
	public function __construct( Store $store, DeepSeek $client, $clock = null ) {
		$this->store  = $store;
		$this->client = $client;
		$this->clock  = $clock ? $clock : function () {
			return time();
		};
	}

	/** 總步數：五章 + 寄語。 */
	public static function total_steps() {
		return count( Prompts::chapters() ) + 1;
	}

	/**
	 * 建立任務；同一位買家的同一份結果已存在時直接回傳原任務（冪等）。
	 *
	 * @param string $license 已驗證過的授權碼。
	 * @param array  $result  評估結果。
	 * @return array{job:array,created:bool,error:string}
	 */
	public function create_or_get( $license, array $result ) {
		$existing = $this->store->find_by_license_and_code( $license, $result['code'] );
		if ( $existing ) {
			return array( 'job' => $existing, 'created' => false, 'error' => '' );
		}

		if ( $this->store->count_for_license( $license ) >= self::MAX_PER_LICENSE ) {
			return array(
				'job'     => array(),
				'created' => false,
				'error'   => '這組授權碼已達生成上限（' . self::MAX_PER_LICENSE . ' 份）。如需協助請與我們聯絡。',
			);
		}

		$now = call_user_func( $this->clock );
		$job = array(
			'job_key'    => self::new_key(),
			'license'    => $license,
			'code'       => $result['code'],
			'archetype'  => $result['archetype'],
			'band'       => $result['band'],
			'entropy'    => (int) $result['entropy'],
			'boundary'   => (int) $result['boundary'],
			'flow'       => (int) $result['flow'],
			'work'       => (int) $result['work'],
			'bottleneck' => $result['bottleneck'],
			'status'     => self::STATUS_QUEUED,
			'step'       => 0,
			'attempts'   => 0,
			'chapters'   => array(),
			'message'    => '',
			'error'      => '',
			'locked_at'  => 0,
			'created_at' => $now,
			'updated_at' => $now,
		);
		$this->store->insert( $job );

		return array( 'job' => $job, 'created' => true, 'error' => '' );
	}

	/**
	 * 執行一個步驟：生成一章（或最後的寄語）。
	 *
	 * @param string $job_key 任務金鑰。
	 * @return array{status:string,step:int,done:bool,skipped:bool,error:string}
	 */
	public function step( $job_key ) {
		$job = $this->store->find( $job_key );
		if ( ! $job ) {
			return $this->outcome( self::STATUS_FAILED, 0, false, false, '找不到這份報告' );
		}
		if ( self::STATUS_DONE === $job['status'] || self::STATUS_FAILED === $job['status'] ) {
			return $this->outcome( $job['status'], (int) $job['step'], self::STATUS_DONE === $job['status'], true, (string) $job['error'] );
		}

		$now = call_user_func( $this->clock );
		if ( ! $this->store->claim( $job_key, self::STALE_SECONDS, $now ) ) {
			// 另一個行程正在處理這一步，直接離開，不重複花錢。
			return $this->outcome( self::STATUS_PROCESSING, (int) $job['step'], false, true, '' );
		}

		$this->store->update( $job_key, array( 'status' => self::STATUS_PROCESSING, 'updated_at' => $now ) );

		$step     = (int) $job['step'];
		$chapters = Prompts::chapters();
		$prefix   = Prompts::context_prefix( $job );
		$stricter = ( (int) $job['attempts'] ) > 0;

		try {
			if ( $step < count( $chapters ) ) {
				$chapter     = $chapters[ $step ];
				$instruction = Prompts::chapter_instruction( $job, $step, $stricter );
				$response    = $this->client->complete( $prefix, $instruction );
				$body        = Quality::extract_body( $response['content'] );

				$check = Quality::check( $body, $chapter['min'] );
				if ( ! $check['ok'] ) {
					throw new \RuntimeException( '品質不合格：' . $check['reason'] );
				}

				$done_chapters   = is_array( $job['chapters'] ) ? $job['chapters'] : array();
				$done_chapters[] = array( 'key' => $chapter['key'], 'title' => $chapter['title'], 'body' => $body );

				$this->store->update(
					$job_key,
					array(
						'chapters'   => $done_chapters,
						'step'       => $step + 1,
						'attempts'   => 0,
						'error'      => '',
						'locked_at'  => 0,
						'updated_at' => call_user_func( $this->clock ),
					)
				);
			} else {
				$response = $this->client->complete( $prefix, Prompts::message_instruction( $job ), 600 );
				$message  = Quality::extract_body( $response['content'] );

				$this->store->update(
					$job_key,
					array(
						'message'    => $message,
						'step'       => $step + 1,
						'status'     => self::STATUS_DONE,
						'attempts'   => 0,
						'error'      => '',
						'locked_at'  => 0,
						'updated_at' => call_user_func( $this->clock ),
					)
				);

				return $this->outcome( self::STATUS_DONE, $step + 1, true, false, '' );
			}
		} catch ( \Exception $e ) {
			$attempts = ( (int) $job['attempts'] ) + 1;
			$failed   = $attempts >= self::MAX_ATTEMPTS;

			$this->store->update(
				$job_key,
				array(
					'attempts'   => $attempts,
					'status'     => $failed ? self::STATUS_FAILED : self::STATUS_QUEUED,
					// 失敗訊息只留給客服看，不直接顯示給使用者
					'error'      => $e->getMessage(),
					'locked_at'  => 0,
					'updated_at' => call_user_func( $this->clock ),
				)
			);

			return $this->outcome(
				$failed ? self::STATUS_FAILED : self::STATUS_QUEUED,
				$step,
				false,
				false,
				$e->getMessage()
			);
		}

		return $this->outcome( self::STATUS_PROCESSING, $step + 1, false, false, '' );
	}

	/**
	 * 給前端輪詢用的進度資料。已完成的章節會即時回傳，讓報告逐章浮現。
	 *
	 * @param array $job 任務。
	 * @return array
	 */
	public static function progress( array $job ) {
		$total = self::total_steps();
		$step  = min( (int) $job['step'], $total );

		return array(
			'job'      => $job['job_key'],
			'status'   => $job['status'],
			'step'     => $step,
			'total'    => $total,
			'percent'  => (int) round( $step / $total * 100 ),
			'chapters' => is_array( $job['chapters'] ) ? $job['chapters'] : array(),
			'message'  => (string) $job['message'],
		);
	}

	/**
	 * 任務是否卡住——前端輪詢時據此自我修復：
	 * 主機擋掉 loopback 請求、WP-Cron 又沒被觸發時，輪詢本身會把它推下去。
	 *
	 * @param array $job 任務。
	 * @param int   $now 現在時間。
	 * @return bool
	 */
	public static function is_stalled( array $job, $now ) {
		if ( self::STATUS_DONE === $job['status'] || self::STATUS_FAILED === $job['status'] ) {
			return false;
		}
		$locked = (int) $job['locked_at'];
		if ( $locked > 0 ) {
			return ( $now - $locked ) > self::STALE_SECONDS;
		}
		return ( $now - (int) $job['updated_at'] ) > 20;
	}

	/**
	 * @return string
	 */
	private static function new_key() {
		if ( function_exists( 'wp_generate_password' ) ) {
			return strtolower( wp_generate_password( 32, false, false ) );
		}
		return bin2hex( random_bytes( 16 ) );
	}

	/**
	 * @param string $status  狀態。
	 * @param int    $step    目前步驟。
	 * @param bool   $done    是否完成。
	 * @param bool   $skipped 是否因為鎖或已完成而略過。
	 * @param string $error   錯誤訊息。
	 * @return array
	 */
	private function outcome( $status, $step, $done, $skipped, $error ) {
		return array(
			'status'  => $status,
			'step'    => $step,
			'done'    => $done,
			'skipped' => $skipped,
			'error'   => $error,
		);
	}
}
