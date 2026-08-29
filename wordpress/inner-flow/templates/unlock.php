<?php
/**
 * 解鎖與生成進度。放在購買完成後的導向頁，或測驗結果頁下方。
 *
 * @package InnerFlow
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}
?>
<div class="inner-flow-unlock" id="innerFlowUnlock">
	<p class="if-eyebrow">Unlock Your Report</p>
	<h3 class="if-title">輸入授權碼，生成你的破局手冊</h3>
	<p class="if-lead">
		授權碼在購買完成的頁面與 Gumroad 的收據信裡。生成需要一到兩分鐘，
		章節會一段一段出現，過程中可以留在這一頁。
	</p>

	<form class="if-form" id="innerFlowForm" novalidate>
		<input type="text" id="innerFlowLicense" placeholder="XXXXXXXX-XXXXXXXX-XXXXXXXX-XXXXXXXX"
		       autocomplete="off" spellcheck="false" aria-label="Gumroad 授權碼" />
		<button type="submit" id="innerFlowSubmit">開始生成</button>
	</form>

	<p class="if-msg" id="innerFlowMsg" role="status" aria-live="polite"></p>

	<div class="if-progress" id="innerFlowProgress" hidden>
		<div class="if-bar"><span id="innerFlowBar"></span></div>
		<p class="if-step" id="innerFlowStep"></p>
	</div>

	<div class="if-preview" id="innerFlowPreview"></div>
</div>
