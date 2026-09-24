<?php
/**
 * 任務儲存介面。抽出來是為了讓 Jobs 的狀態機不依賴 WordPress，
 * 測試時換成記憶體實作即可完整驗證。
 *
 * @package InnerFlow
 */

namespace InnerFlow;

if ( ! defined( 'ABSPATH' ) && ! defined( 'INNER_FLOW_TEST' ) ) {
	exit;
}

interface Store {

	/**
	 * @param string $job_key 任務金鑰。
	 * @return array|null
	 */
	public function find( $job_key );

	/**
	 * 同一位買家、同一份測驗結果只會有一個任務（冪等）。
	 *
	 * @param string $license 授權碼。
	 * @param string $code    答案碼。
	 * @return array|null
	 */
	public function find_by_license_and_code( $license, $code );

	/**
	 * @param array $job 完整任務資料。
	 * @return void
	 */
	public function insert( array $job );

	/**
	 * @param string $job_key 任務金鑰。
	 * @param array  $fields  要更新的欄位。
	 * @return void
	 */
	public function update( $job_key, array $fields );

	/**
	 * 這組授權碼已經生成過幾份不同的報告。
	 *
	 * @param string $license 授權碼。
	 * @return int
	 */
	public function count_for_license( $license );

	/**
	 * 嘗試取得處理鎖。已被其他行程鎖住且未逾時者回傳 false。
	 *
	 * @param string $job_key       任務金鑰。
	 * @param int    $stale_seconds 多久沒有進度就視為卡住，可被接手。
	 * @param int    $now           現在時間（Unix 時間戳）。
	 * @return bool
	 */
	public function claim( $job_key, $stale_seconds, $now );
}
