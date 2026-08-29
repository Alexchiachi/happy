<?php
/**
 * Plugin Name:       Inner Flow Assessment
 * Plugin URI:        https://github.com/Alexchiachi/happy
 * Description:       內耗狀態自我評估的付費報告生成：驗證 Gumroad 授權碼後，以 DeepSeek 分章生成《自洽躍遷破局手冊》，並在報告頁附上語音導引。
 * Version:           1.0.0
 * Requires at least: 6.0
 * Requires PHP:      7.4
 * Author:            簡家旗
 * License:           GPL-2.0-or-later
 * Text Domain:       inner-flow
 *
 * @package InnerFlow
 */

namespace InnerFlow;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

define( 'INNER_FLOW_VERSION', '1.0.0' );
define( 'INNER_FLOW_DIR', plugin_dir_path( __FILE__ ) );
define( 'INNER_FLOW_URL', plugin_dir_url( __FILE__ ) );

require_once INNER_FLOW_DIR . 'includes/Prompts.php';
require_once INNER_FLOW_DIR . 'includes/Quality.php';
require_once INNER_FLOW_DIR . 'includes/DeepSeek.php';
require_once INNER_FLOW_DIR . 'includes/Gumroad.php';
require_once INNER_FLOW_DIR . 'includes/Store.php';
require_once INNER_FLOW_DIR . 'includes/WpdbStore.php';
require_once INNER_FLOW_DIR . 'includes/Jobs.php';
require_once INNER_FLOW_DIR . 'includes/ReportBuilder.php';
require_once INNER_FLOW_DIR . 'includes/Rest.php';

class Plugin {

	/** 四種原型對應的語音檔（真人錄音），在設定頁填入網址。 */
	const AUDIO_OPTION = 'inner_flow_audio';

	public static function boot() {
		register_activation_hook( __FILE__, array( __CLASS__, 'activate' ) );
		add_action( 'rest_api_init', array( Rest::class, 'register' ) );
		add_action( Rest::CRON_HOOK, array( Rest::class, 'run' ) );
		add_shortcode( 'inner_flow_unlock', array( __CLASS__, 'render_unlock' ) );
		add_shortcode( 'inner_flow_report', array( __CLASS__, 'render_report' ) );
		add_action( 'admin_menu', array( __CLASS__, 'admin_menu' ) );
		add_action( 'admin_init', array( __CLASS__, 'register_settings' ) );
	}

	public static function activate() {
		self::store()->install();
	}

	/* ---------- 設定：金鑰放 wp-config.php，不進資料庫 ---------- */

	public static function api_key() {
		return defined( 'INNER_FLOW_DEEPSEEK_KEY' ) ? (string) INNER_FLOW_DEEPSEEK_KEY : '';
	}

	public static function model() {
		return defined( 'INNER_FLOW_DEEPSEEK_MODEL' ) ? (string) INNER_FLOW_DEEPSEEK_MODEL : 'deepseek-chat';
	}

	public static function gumroad_product_id() {
		return defined( 'INNER_FLOW_GUMROAD_PRODUCT_ID' ) ? (string) INNER_FLOW_GUMROAD_PRODUCT_ID : '';
	}

	/* ---------- 元件組裝 ---------- */

	/**
	 * wp_remote_post 的薄包裝，讓核心類別不必認識 WordPress。
	 *
	 * @return callable
	 */
	public static function transport() {
		return function ( $url, $args ) {
			$response = wp_remote_post( $url, $args );
			if ( is_wp_error( $response ) ) {
				return array( 'code' => 0, 'body' => $response->get_error_message() );
			}
			return array(
				'code' => (int) wp_remote_retrieve_response_code( $response ),
				'body' => (string) wp_remote_retrieve_body( $response ),
			);
		};
	}

	public static function store() {
		global $wpdb;
		static $store = null;
		if ( null === $store ) {
			$store = new WpdbStore( $wpdb );
		}
		return $store;
	}

	public static function jobs() {
		return new Jobs( self::store(), new DeepSeek( self::transport(), self::api_key(), self::model() ) );
	}

	public static function gumroad() {
		return new Gumroad( self::transport(), self::gumroad_product_id() );
	}

	/* ---------- 短代碼 ---------- */

	/**
	 * [inner_flow_unlock] — 放在測驗頁或購買後的導向頁：
	 * 輸入授權碼即開始生成，並就地顯示進度與逐章浮現的內容。
	 */
	public static function render_unlock( $atts ) {
		wp_enqueue_style( 'inner-flow', INNER_FLOW_URL . 'assets/inner-flow.css', array(), INNER_FLOW_VERSION );
		wp_enqueue_script( 'inner-flow-unlock', INNER_FLOW_URL . 'assets/unlock.js', array(), INNER_FLOW_VERSION, true );
		wp_localize_script(
			'inner-flow-unlock',
			'InnerFlowConfig',
			array(
				'rest'      => esc_url_raw( rest_url( Rest::NAMESPACE_V1 ) ),
				'reportUrl' => esc_url_raw( self::report_page_url() ),
				'steps'     => Jobs::total_steps(),
			)
		);

		ob_start();
		require INNER_FLOW_DIR . 'templates/unlock.php';
		return ob_get_clean();
	}

	/**
	 * [inner_flow_report] — 報告頁：以 ?job=<key> 讀取已完成的報告。
	 */
	public static function render_report( $atts ) {
		wp_enqueue_style( 'inner-flow', INNER_FLOW_URL . 'assets/inner-flow.css', array(), INNER_FLOW_VERSION );

		$job_key = isset( $_GET['job'] ) ? sanitize_text_field( wp_unslash( $_GET['job'] ) ) : '';
		$job     = $job_key ? self::store()->find( $job_key ) : null;

		ob_start();
		if ( ! $job ) {
			echo '<p class="inner-flow-note">找不到這份報告。請確認連結是否完整。</p>';
		} else {
			$sections = ReportBuilder::sections( $job );
			$pages    = ReportBuilder::estimate_pages( $job );
			$audio    = self::audio_for( $job['archetype'] );
			require INNER_FLOW_DIR . 'templates/report.php';
		}
		return ob_get_clean();
	}

	public static function report_page_url() {
		$page_id = (int) get_option( 'inner_flow_report_page', 0 );
		return $page_id ? get_permalink( $page_id ) : home_url( '/inner-flow-report/' );
	}

	/**
	 * 依原型取回對應的真人錄音網址。
	 *
	 * @param string $archetype 原型全名。
	 * @return string
	 */
	public static function audio_for( $archetype ) {
		$map  = get_option( self::AUDIO_OPTION, array() );
		$keys = array(
			'邊界滲漏'   => 'leak',
			'次生擾動'   => 'rumination',
			'完美主義' => 'freeze',
			'動態自洽'   => 'flow',
		);
		foreach ( $keys as $needle => $slug ) {
			if ( false !== mb_strpos( $archetype, $needle ) ) {
				return isset( $map[ $slug ] ) ? (string) $map[ $slug ] : '';
			}
		}
		return '';
	}

	/* ---------- 後台 ---------- */

	public static function admin_menu() {
		add_options_page( 'Inner Flow', 'Inner Flow', 'manage_options', 'inner-flow', array( __CLASS__, 'render_settings' ) );
	}

	public static function register_settings() {
		register_setting(
			'inner_flow',
			self::AUDIO_OPTION,
			array(
				'sanitize_callback' => array( __CLASS__, 'sanitize_audio' ),
				'default'           => array(),
			)
		);
		register_setting( 'inner_flow', 'inner_flow_report_page', array( 'sanitize_callback' => 'absint', 'default' => 0 ) );
	}

	public static function sanitize_audio( $value ) {
		$clean = array();
		foreach ( array( 'leak', 'rumination', 'freeze', 'flow' ) as $slug ) {
			$clean[ $slug ] = isset( $value[ $slug ] ) ? esc_url_raw( trim( $value[ $slug ] ) ) : '';
		}
		return $clean;
	}

	public static function render_settings() {
		if ( ! current_user_can( 'manage_options' ) ) {
			return;
		}
		require INNER_FLOW_DIR . 'templates/settings.php';
	}
}

Plugin::boot();
