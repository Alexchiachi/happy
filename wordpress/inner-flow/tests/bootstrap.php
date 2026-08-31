<?php
/**
 * 測試用啟動檔：不需要 WordPress，也不需要真的 API 金鑰。
 * 以記憶體實作取代資料庫，以替身取代 HTTP 傳輸。
 */

define( 'INNER_FLOW_TEST', true );

require __DIR__ . '/../includes/Prompts.php';
require __DIR__ . '/../includes/Quality.php';
require __DIR__ . '/../includes/DeepSeek.php';
require __DIR__ . '/../includes/Gumroad.php';
require __DIR__ . '/../includes/Store.php';
require __DIR__ . '/../includes/Jobs.php';
require __DIR__ . '/../includes/ReportBuilder.php';

// 樣板需要 WordPress 的跳脫函式；測試時以最小替身取代。
define( 'ABSPATH', __DIR__ . '/' );
function esc_html( $text ) { return htmlspecialchars( (string) $text, ENT_QUOTES, 'UTF-8' ); }
function esc_attr( $text ) { return htmlspecialchars( (string) $text, ENT_QUOTES, 'UTF-8' ); }
function esc_url( $url ) { return filter_var( (string) $url, FILTER_SANITIZE_URL ); }

/** 記憶體版任務儲存。 */
class MemoryStore implements InnerFlow\Store {

	public $rows = array();

	public function find( $job_key ) {
		return isset( $this->rows[ $job_key ] ) ? $this->rows[ $job_key ] : null;
	}

	public function find_by_license_and_code( $license, $code ) {
		foreach ( $this->rows as $row ) {
			if ( $row['license'] === $license && $row['code'] === $code ) {
				return $row;
			}
		}
		return null;
	}

	public function insert( array $job ) {
		$this->rows[ $job['job_key'] ] = $job;
	}

	public function update( $job_key, array $fields ) {
		$this->rows[ $job_key ] = array_merge( $this->rows[ $job_key ], $fields );
	}

	public function count_for_license( $license ) {
		$count = 0;
		foreach ( $this->rows as $row ) {
			if ( $row['license'] === $license ) {
				$count++;
			}
		}
		return $count;
	}

	public function claim( $job_key, $stale_seconds, $now ) {
		$row = $this->rows[ $job_key ];
		if ( (int) $row['locked_at'] > 0 && ( $now - (int) $row['locked_at'] ) < $stale_seconds ) {
			return false;
		}
		$this->rows[ $job_key ]['locked_at'] = $now;
		return true;
	}
}

/** 極簡測試框架。 */
class T {
	public static $pass = 0;
	public static $fail = 0;
	public static $current = '';

	public static function test( $name, callable $fn ) {
		self::$current = $name;
		try {
			$fn();
			echo "ok   {$name}\n";
			self::$pass++;
		} catch ( Throwable $e ) {
			echo "FAIL {$name}\n     {$e->getMessage()}\n";
			self::$fail++;
		}
	}

	public static function is( $actual, $expected, $label = '' ) {
		if ( $actual !== $expected ) {
			throw new Exception( $label . ' 預期 ' . var_export( $expected, true ) . '，實得 ' . var_export( $actual, true ) );
		}
	}

	public static function ok( $value, $label = '' ) {
		if ( ! $value ) {
			throw new Exception( $label . ' 預期為真' );
		}
	}

	public static function throws( callable $fn, $needle, $label = '' ) {
		try {
			$fn();
		} catch ( Throwable $e ) {
			if ( false === strpos( $e->getMessage(), $needle ) ) {
				throw new Exception( $label . ' 錯誤訊息不含「' . $needle . '」，實得：' . $e->getMessage() );
			}
			return;
		}
		throw new Exception( $label . ' 預期會丟出例外，但沒有' );
	}

	public static function summary() {
		echo "\n通過 " . self::$pass . " 項，失敗 " . self::$fail . " 項\n";
		exit( self::$fail > 0 ? 1 : 0 );
	}
}

/** 評估結果範例。 */
function sample_result() {
	return array(
		'archetype'  => '次生擾動型：思維反芻與情緒代謝延遲',
		'band'       => '中高熵',
		'entropy'    => 61,
		'boundary'   => 33,
		'flow'       => 33,
		'work'       => 50,
		'bottleneck' => '心智流動度',
		'code'       => '223142',
	);
}

/** 產生一段長度足夠、不含禁用語的假章節。 */
function fake_body( $length = 700 ) {
	return str_repeat( '這是一段關於能量邊界與耗散路徑的描述文字。', (int) ceil( $length / 21 ) );
}

/** 可程式化的 DeepSeek 傳輸替身。 */
function fake_transport( array &$calls, callable $responder ) {
	return function ( $url, $args ) use ( &$calls, $responder ) {
		$calls[] = array( 'url' => $url, 'args' => $args );
		return call_user_func( $responder, count( $calls ), $args );
	};
}
