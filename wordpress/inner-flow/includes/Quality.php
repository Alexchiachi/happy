<?php
/**
 * 生成品質把關：模型回傳的內容在寫進資料庫之前必須先過這一關。
 *
 * 比起在提示詞裡多寫十條禁令，在程式裡實際檢查、不合格就重寫一次，
 * 對輸出品質的影響大得多。
 *
 * @package InnerFlow
 */

namespace InnerFlow;

if ( ! defined( 'ABSPATH' ) && ! defined( 'INNER_FLOW_TEST' ) ) {
	exit;
}

class Quality {

	/** 心靈雞湯句式：出現任何一個就退回重寫。 */
	const BANNED = array(
		'加油',
		'你可以的',
		'相信自己',
		'一切都會好起來',
		'一切都會過去',
		'宇宙會',
		'心想事成',
		'正能量',
	);

	/**
	 * 從模型回應中取出 JSON 的 body 欄位。
	 * 模型偶爾會加上 ```json 圍欄或前後贅字，這裡一併處理。
	 *
	 * @param string $raw 模型原始輸出。
	 * @return string
	 * @throws \RuntimeException 當內容無法解析為預期格式時。
	 */
	public static function extract_body( $raw ) {
		$cleaned = trim( (string) $raw );
		$cleaned = preg_replace( '/^```(?:json)?\s*/i', '', $cleaned );
		$cleaned = preg_replace( '/```\s*$/', '', (string) $cleaned );

		$start = strpos( (string) $cleaned, '{' );
		$end   = strrpos( (string) $cleaned, '}' );
		if ( false === $start || false === $end ) {
			throw new \RuntimeException( '模型回傳的內容不是 JSON' );
		}

		$data = json_decode( substr( $cleaned, $start, $end - $start + 1 ), true );
		if ( ! is_array( $data ) || ! isset( $data['body'] ) || ! is_string( $data['body'] ) ) {
			throw new \RuntimeException( '模型回傳的 JSON 缺少 body 欄位' );
		}

		return trim( $data['body'] );
	}

	/**
	 * 檢查章節內容是否合格。
	 *
	 * @param string $body 章節內文。
	 * @param int    $min  最少字數（中文以字元計）。
	 * @return array{ok:bool,reason:string}
	 */
	public static function check( $body, $min ) {
		$length = mb_strlen( $body, 'UTF-8' );

		// 允許比下限短一成：模型的字數控制本來就不精準，
		// 差一點就整章重生成太浪費，差太多才是真的沒寫完。
		if ( $length < (int) floor( $min * 0.9 ) ) {
			return array(
				'ok'     => false,
				'reason' => '字數不足（' . $length . ' 字，下限 ' . $min . '）',
			);
		}

		foreach ( self::BANNED as $phrase ) {
			if ( false !== mb_strpos( $body, $phrase ) ) {
				return array( 'ok' => false, 'reason' => '出現空泛鼓勵句：' . $phrase );
			}
		}

		if ( false !== mb_strpos( $body, '##' ) || false !== mb_strpos( $body, '**' ) ) {
			return array( 'ok' => false, 'reason' => '含有 markdown 標記' );
		}

		return array( 'ok' => true, 'reason' => '' );
	}
}
