<?php
/**
 * 後台設定：狀態檢查與四段真人錄音的網址。
 * API 金鑰刻意不放在這裡——它屬於 wp-config.php。
 *
 * @package InnerFlow
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

$audio  = get_option( InnerFlow\Plugin::AUDIO_OPTION, array() );
$labels = array(
	'leak'       => '極高熵 · 邊界滲漏型',
	'rumination' => '中高熵 · 次生擾動型',
	'freeze'     => '中等熵 · 完美主義凍結型',
	'flow'       => '平衡自洽 · 動態自洽型',
);
?>
<div class="wrap">
	<h1>Inner Flow</h1>

	<h2>狀態</h2>
	<table class="widefat striped" style="max-width:640px">
		<tbody>
			<tr>
				<td>DeepSeek 金鑰</td>
				<td><?php echo '' !== InnerFlow\Plugin::api_key() ? '已設定' : '<strong>尚未設定</strong>：請在 wp-config.php 加入 INNER_FLOW_DEEPSEEK_KEY'; ?></td>
			</tr>
			<tr>
				<td>模型</td>
				<td><code><?php echo esc_html( InnerFlow\Plugin::model() ); ?></code></td>
			</tr>
			<tr>
				<td>Gumroad 商品 ID</td>
				<td><?php echo '' !== InnerFlow\Plugin::gumroad_product_id() ? '已設定' : '<strong>尚未設定</strong>：請在 wp-config.php 加入 INNER_FLOW_GUMROAD_PRODUCT_ID'; ?></td>
			</tr>
			<tr>
				<td>每份報告的生成步數</td>
				<td><?php echo (int) InnerFlow\Jobs::total_steps(); ?>（五章 + 寄語，每步一次模型呼叫）</td>
			</tr>
		</tbody>
	</table>

	<form method="post" action="options.php" style="margin-top:2rem">
		<?php settings_fields( 'inner_flow' ); ?>

		<h2>報告頁</h2>
		<p>選一個放了 <code>[inner_flow_report]</code> 短代碼的頁面。</p>
		<?php
		wp_dropdown_pages(
			array(
				'name'              => 'inner_flow_report_page',
				'selected'          => (int) get_option( 'inner_flow_report_page', 0 ),
				'show_option_none'  => '— 尚未選擇 —',
				'option_none_value' => 0,
			)
		);
		?>

		<h2 style="margin-top:2rem">語音導引（真人錄音）</h2>
		<p>四種原型各一段。上傳到媒體庫後，把網址貼在這裡；留空則報告頁不顯示語音區塊。</p>
		<table class="form-table">
			<?php foreach ( $labels as $slug => $label ) : ?>
				<tr>
					<th scope="row"><label for="if-audio-<?php echo esc_attr( $slug ); ?>"><?php echo esc_html( $label ); ?></label></th>
					<td>
						<input type="url" class="regular-text" id="if-audio-<?php echo esc_attr( $slug ); ?>"
						       name="<?php echo esc_attr( InnerFlow\Plugin::AUDIO_OPTION ); ?>[<?php echo esc_attr( $slug ); ?>]"
						       value="<?php echo esc_attr( isset( $audio[ $slug ] ) ? $audio[ $slug ] : '' ); ?>"
						       placeholder="https://example.com/wp-content/uploads/inner-flow-<?php echo esc_attr( $slug ); ?>.mp3" />
					</td>
				</tr>
			<?php endforeach; ?>
		</table>

		<?php submit_button(); ?>
	</form>
</div>
