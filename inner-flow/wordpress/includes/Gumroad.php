<?php
/**
 * Gumroad 授權碼驗證：報告是付費商品，生成前必須先確認買過。
 *
 * 沒有這道閘門，任何人都能寫個迴圈把你的 DeepSeek 額度燒光。
 *
 * @package InnerFlow
 */

namespace InnerFlow;

if ( ! defined( 'ABSPATH' ) && ! defined( 'INNER_FLOW_TEST' ) ) {
	exit;
}

class Gumroad {

	/** @var callable */
	private $transport;

	/** @var string */
	private $product_id;

	/** @var string */
	private $endpoint;

	/**
	 * @param callable $transport  function(string $url, array $args): array{code:int,body:string}
	 * @param string   $product_id Gumroad 商品 ID。
	 * @param string   $endpoint   驗證端點。
	 */
	public function __construct( $transport, $product_id, $endpoint = 'https://api.gumroad.com/v2/licenses/verify' ) {
		$this->transport  = $transport;
		$this->product_id = $product_id;
		$this->endpoint   = $endpoint;
	}

	/**
	 * 驗證授權碼。
	 *
	 * increment_uses_count 固定為 false：使用次數由我們自己的資料庫控管，
	 * 讓買家可以重看報告，但不能無限次觸發生成。
	 *
	 * @param string $license 授權碼。
	 * @return array{valid:bool,reason:string,email:string,order_id:string}
	 */
	public function verify( $license ) {
		$license = trim( (string) $license );
		if ( '' === $license ) {
			return self::invalid( '請輸入授權碼' );
		}

		$response = call_user_func(
			$this->transport,
			$this->endpoint,
			array(
				'headers' => array( 'Content-Type' => 'application/x-www-form-urlencoded' ),
				'body'    => http_build_query(
					array(
						'product_id'           => $this->product_id,
						'license_key'          => $license,
						'increment_uses_count' => 'false',
					)
				),
				'timeout' => 15,
			)
		);

		$code = isset( $response['code'] ) ? (int) $response['code'] : 0;
		$data = json_decode( isset( $response['body'] ) ? (string) $response['body'] : '', true );

		if ( 200 !== $code || ! is_array( $data ) || empty( $data['success'] ) ) {
			return self::invalid( '授權碼無效，請確認是否與購買時收到的一致' );
		}

		$purchase = isset( $data['purchase'] ) && is_array( $data['purchase'] ) ? $data['purchase'] : array();

		if ( ! empty( $purchase['refunded'] ) || ! empty( $purchase['chargebacked'] ) ) {
			return self::invalid( '這筆訂單已退款' );
		}
		if ( ! empty( $purchase['subscription_cancelled_at'] ) ) {
			return self::invalid( '這組授權已停用' );
		}

		return array(
			'valid'    => true,
			'reason'   => '',
			'email'    => isset( $purchase['email'] ) ? (string) $purchase['email'] : '',
			'order_id' => isset( $purchase['order_number'] ) ? (string) $purchase['order_number'] : '',
		);
	}

	/**
	 * @param string $reason 失敗原因。
	 * @return array{valid:bool,reason:string,email:string,order_id:string}
	 */
	private static function invalid( $reason ) {
		return array( 'valid' => false, 'reason' => $reason, 'email' => '', 'order_id' => '' );
	}
}
