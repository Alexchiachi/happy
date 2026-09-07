<?php
/**
 * 報告頁。列印樣式即為 PDF 輸出——共享主機沒有 headless Chrome，
 * 由瀏覽器產生 PDF 反而是向量、免費、零延遲。
 *
 * @var array  $job      任務資料
 * @var array  $sections 報告區段
 * @var int    $pages    估算頁數
 * @var string $audio    真人錄音網址
 *
 * @package InnerFlow
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}
?>
<article class="inner-flow-report">

	<header class="if-cover">
		<p class="if-eyebrow">Inner Flow Assessment</p>
		<h1 class="if-report-title">自洽躍遷破局手冊</h1>
		<p class="if-archetype"><?php echo esc_html( $job['archetype'] ); ?></p>
		<p class="if-meta">
			<?php echo esc_html( $job['band'] ); ?>　·　內耗熵值 <?php echo (int) $job['entropy']; ?>　·　
			全書 <?php echo (int) $pages; ?> 頁
		</p>
		<button type="button" class="if-print no-print" onclick="window.print()">下載 PDF</button>
	</header>

	<section class="if-coordinates">
		<h2>你的能量座標</h2>
		<div class="if-dims">
			<?php foreach ( InnerFlow\ReportBuilder::dimensions() as $dimension ) : ?>
				<div class="if-dim<?php echo $job['bottleneck'] === $dimension['name'] ? ' is-bottleneck' : ''; ?>">
					<b><?php echo (int) $job[ $dimension['field'] ]; ?></b>
					<span><?php echo esc_html( $dimension['name'] ); ?></span>
					<p><?php echo esc_html( $dimension['desc'] ); ?></p>
				</div>
			<?php endforeach; ?>
		</div>
		<p class="if-formula">
			內耗熵值 S = 100 −（<?php echo (int) $job['boundary']; ?> + <?php echo (int) $job['flow']; ?>
			+ <?php echo (int) $job['work']; ?>）/ 3 = <?php echo (int) $job['entropy']; ?>
		</p>
		<?php if ( '無明顯瓶頸' !== $job['bottleneck'] ) : ?>
			<p class="if-bottleneck">目前的瓶頸維度：<?php echo esc_html( $job['bottleneck'] ); ?></p>
		<?php endif; ?>
	</section>

	<?php foreach ( $sections as $section ) : ?>
		<?php if ( 'chapter' === $section['type'] ) : ?>
			<section class="if-chapter">
				<h2><?php echo esc_html( $section['title'] ); ?></h2>
				<?php foreach ( InnerFlow\ReportBuilder::paragraphs( $section['body'] ) as $paragraph ) : ?>
					<p><?php echo esc_html( $paragraph ); ?></p>
				<?php endforeach; ?>
			</section>
		<?php elseif ( 'message' === $section['type'] ) : ?>
			<section class="if-message">
				<h2>寄語</h2>
				<?php foreach ( InnerFlow\ReportBuilder::paragraphs( $section['body'] ) as $paragraph ) : ?>
					<p><?php echo esc_html( $paragraph ); ?></p>
				<?php endforeach; ?>
				<p class="if-sign">— 簡家旗</p>
			</section>
		<?php endif; ?>
	<?php endforeach; ?>

	<?php if ( $audio ) : ?>
		<section class="if-audio no-print">
			<h2>身心復位語音導引</h2>
			<p>依你的原型錄製，建議戴上耳機，找一個不會被打斷的十分鐘。</p>
			<audio controls preload="none" src="<?php echo esc_url( $audio ); ?>"></audio>
		</section>
	<?php endif; ?>

	<footer class="if-footer">
		<p>本報告依你在 <?php echo esc_html( gmdate( 'Y-m-d', (int) $job['created_at'] ) ); ?> 的評估結果生成，僅供你個人使用。</p>
		<p>本報告為自我覺察用途，不構成醫療或心理診斷建議。</p>
	</footer>
</article>
