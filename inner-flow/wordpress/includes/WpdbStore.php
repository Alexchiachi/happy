<?php
/**
 * Store 的 WordPress 實作。SQL 全部走 $wpdb->prepare。
 *
 * @package InnerFlow
 */

namespace InnerFlow;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class WpdbStore implements Store {

	/** @var \wpdb */
	private $db;

	/** @var string */
	private $table;

	public function __construct( $db ) {
		$this->db    = $db;
		$this->table = $db->prefix . 'inner_flow_reports';
	}

	public function table_name() {
		return $this->table;
	}

	/**
	 * 建表。dbDelta 會處理欄位新增，因此升級時再呼叫一次即可。
	 */
	public function install() {
		require_once ABSPATH . 'wp-admin/includes/upgrade.php';
		$charset = $this->db->get_charset_collate();

		dbDelta(
			"CREATE TABLE {$this->table} (
				id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
				job_key VARCHAR(40) NOT NULL,
				license VARCHAR(64) NOT NULL,
				code VARCHAR(12) NOT NULL,
				archetype VARCHAR(120) NOT NULL,
				band VARCHAR(40) NOT NULL,
				entropy TINYINT UNSIGNED NOT NULL,
				boundary TINYINT UNSIGNED NOT NULL,
				flow TINYINT UNSIGNED NOT NULL,
				work TINYINT UNSIGNED NOT NULL,
				bottleneck VARCHAR(40) NOT NULL,
				status VARCHAR(16) NOT NULL,
				step TINYINT UNSIGNED NOT NULL DEFAULT 0,
				attempts TINYINT UNSIGNED NOT NULL DEFAULT 0,
				chapters LONGTEXT NULL,
				message TEXT NULL,
				error TEXT NULL,
				locked_at INT UNSIGNED NOT NULL DEFAULT 0,
				created_at INT UNSIGNED NOT NULL,
				updated_at INT UNSIGNED NOT NULL,
				PRIMARY KEY (id),
				UNIQUE KEY job_key (job_key),
				UNIQUE KEY license_code (license, code),
				KEY license (license)
			) {$charset};"
		);
	}

	public function find( $job_key ) {
		$row = $this->db->get_row(
			$this->db->prepare( "SELECT * FROM {$this->table} WHERE job_key = %s", $job_key ),
			ARRAY_A
		);
		return $row ? $this->hydrate( $row ) : null;
	}

	public function find_by_license_and_code( $license, $code ) {
		$row = $this->db->get_row(
			$this->db->prepare( "SELECT * FROM {$this->table} WHERE license = %s AND code = %s", $license, $code ),
			ARRAY_A
		);
		return $row ? $this->hydrate( $row ) : null;
	}

	public function insert( array $job ) {
		$job['chapters'] = wp_json_encode( $job['chapters'] );
		$this->db->insert( $this->table, $job );
	}

	public function update( $job_key, array $fields ) {
		if ( isset( $fields['chapters'] ) && is_array( $fields['chapters'] ) ) {
			$fields['chapters'] = wp_json_encode( $fields['chapters'] );
		}
		$this->db->update( $this->table, $fields, array( 'job_key' => $job_key ) );
	}

	public function count_for_license( $license ) {
		return (int) $this->db->get_var(
			$this->db->prepare( "SELECT COUNT(*) FROM {$this->table} WHERE license = %s", $license )
		);
	}

	/**
	 * 以單一 UPDATE 取鎖，避免「先讀後寫」之間被另一個行程插隊。
	 * 受影響列數為 1 才代表拿到鎖。
	 */
	public function claim( $job_key, $stale_seconds, $now ) {
		$updated = $this->db->query(
			$this->db->prepare(
				"UPDATE {$this->table} SET locked_at = %d
				 WHERE job_key = %s AND (locked_at = 0 OR locked_at < %d)",
				$now,
				$job_key,
				$now - (int) $stale_seconds
			)
		);
		return 1 === (int) $updated;
	}

	/**
	 * 資料庫欄位轉回程式使用的型別。
	 *
	 * @param array $row 資料列。
	 * @return array
	 */
	private function hydrate( array $row ) {
		$row['chapters'] = $row['chapters'] ? json_decode( $row['chapters'], true ) : array();
		if ( ! is_array( $row['chapters'] ) ) {
			$row['chapters'] = array();
		}
		foreach ( array( 'entropy', 'boundary', 'flow', 'work', 'step', 'attempts', 'locked_at', 'created_at', 'updated_at' ) as $int ) {
			$row[ $int ] = (int) $row[ $int ];
		}
		$row['message'] = (string) $row['message'];
		$row['error']   = (string) $row['error'];
		return $row;
	}
}
