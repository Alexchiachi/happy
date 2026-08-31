<?php
/**
 * DeepSeek 用戶端。介面與 OpenAI 相容，因此只需一支 chat/completions。
 *
 * HTTP 傳輸以建構子注入，正式環境傳入 wp_remote_post 的包裝，測試時傳入替身，
 * 因此這個類別的邏輯不需要 WordPress 也能測。
 *
 * @package InnerFlow
 */

namespace InnerFlow;

if ( ! defined( 'ABSPATH' ) && ! defined( 'INNER_FLOW_TEST' ) ) {
	exit;
}

class DeepSeek {

	/** @var callable */
	private $transport;

	/** @var string */
	private $api_key;

	/** @var string */
	private $model;

	/** @var string */
	private $endpoint;

	/**
	 * @param callable $transport function(string $url, array $args): array{code:int,body:string}
	 * @param string   $api_key   DeepSeek 金鑰。
	 * @param string   $model     模型名稱。
	 * @param string   $endpoint  端點網址。
	 */
	public function __construct( $transport, $api_key, $model = 'deepseek-chat', $endpoint = 'https://api.deepseek.com/chat/completions' ) {
		$this->transport = $transport;
		$this->api_key   = $api_key;
		$this->model     = $model;
		$this->endpoint  = $endpoint;
	}

	/**
	 * 送出一次補完請求。
	 *
	 * 訊息刻意拆成「system = 固定前綴」與「user = 本章指令」兩段：
	 * 前綴逐字相同，才能命中 DeepSeek 的上下文快取。
	 *
	 * @param string $system      固定前綴。
	 * @param string $instruction 本次指令。
	 * @param int    $max_tokens  輸出上限。
	 * @return array{content:string,usage:array}
	 * @throws \RuntimeException 呼叫失敗時。
	 */
	public function complete( $system, $instruction, $max_tokens = 2400 ) {
		if ( '' === (string) $this->api_key ) {
			throw new \RuntimeException( '尚未設定 DeepSeek API 金鑰' );
		}

		$payload = array(
			'model'           => $this->model,
			'messages'        => array(
				array( 'role' => 'system', 'content' => $system ),
				array( 'role' => 'user', 'content' => $instruction ),
			),
			'response_format' => array( 'type' => 'json_object' ),
			'temperature'     => 0.85,
			'max_tokens'      => (int) $max_tokens,
			'stream'          => false,
		);

		$args = array(
			'headers' => array(
				'Content-Type'  => 'application/json',
				'Authorization' => 'Bearer ' . $this->api_key,
			),
			'body'    => wp_json_encode_compat( $payload ),
			// 單章生成約 20–30 秒；上限給 60 秒，仍遠低於共享主機的執行時間限制。
			'timeout' => 60,
		);

		$response = call_user_func( $this->transport, $this->endpoint, $args );
		$code     = isset( $response['code'] ) ? (int) $response['code'] : 0;
		$body     = isset( $response['body'] ) ? (string) $response['body'] : '';

		if ( 200 !== $code ) {
			// 錯誤內文可能含請求細節，截斷後再記錄，且永遠不記錄金鑰。
			throw new \RuntimeException( 'DeepSeek 回應 ' . $code . '：' . mb_substr( $body, 0, 200 ) );
		}

		$data = json_decode( $body, true );
		if ( ! is_array( $data ) || ! isset( $data['choices'][0]['message']['content'] ) ) {
			throw new \RuntimeException( 'DeepSeek 回應格式不符預期' );
		}

		return array(
			'content' => (string) $data['choices'][0]['message']['content'],
			'usage'   => isset( $data['usage'] ) && is_array( $data['usage'] ) ? $data['usage'] : array(),
		);
	}
}

/**
 * wp_json_encode 在測試環境不存在時的替身。
 *
 * @param mixed $value 要編碼的內容。
 * @return string
 */
function wp_json_encode_compat( $value ) {
	if ( function_exists( 'wp_json_encode' ) ) {
		return wp_json_encode( $value );
	}
	return json_encode( $value, JSON_UNESCAPED_UNICODE );
}
