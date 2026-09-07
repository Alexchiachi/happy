<?php
require __DIR__ . '/bootstrap.php';

use InnerFlow\Jobs;
use InnerFlow\DeepSeek;
use InnerFlow\Gumroad;
use InnerFlow\Quality;
use InnerFlow\Prompts;
use InnerFlow\ReportBuilder;

/* ---------- 提示詞 ---------- */

T::test( '固定前綴逐字相同，五章共用同一段快取', function () {
	$job = sample_result();
	$a = Prompts::context_prefix( $job );
	$b = Prompts::context_prefix( $job );
	T::is( $a, $b );
	T::ok( false !== strpos( $a, '61' ), '前綴應帶入熵值' );
	T::ok( false !== strpos( $a, '心智流動度' ), '前綴應帶入瓶頸維度' );
	// 章節指令則必須各不相同
	$one = Prompts::chapter_instruction( $job, 0 );
	$two = Prompts::chapter_instruction( $job, 1 );
	T::ok( $one !== $two, '各章指令應不同' );
	T::ok( false === strpos( $one, '簡家旗' ), '章節指令不該重複人格設定，否則快取前綴失去意義' );
} );

T::test( '重寫時加上更嚴格的約束', function () {
	$strict = Prompts::chapter_instruction( sample_result(), 0, true );
	T::ok( false !== strpos( $strict, '重寫' ) );
	T::ok( false !== strpos( $strict, '加油' ), '應明列禁用句式' );
} );

/* ---------- 品質把關 ---------- */

T::test( '從 ``` 圍欄與贅字中取出 body', function () {
	T::is( Quality::extract_body( "```json\n{\"body\":\"內文\"}\n```" ), '內文' );
	T::is( Quality::extract_body( '好的，以下是內容：{"body":"內文"}' ), '內文' );
	T::throws( function () { Quality::extract_body( '抱歉我無法回答' ); }, '不是 JSON' );
	T::throws( function () { Quality::extract_body( '{"text":"錯欄位"}' ); }, '缺少 body' );
} );

T::test( '字數不足、雞湯句、markdown 標記都會被擋下', function () {
	T::ok( Quality::check( fake_body( 700 ), 500 )['ok'] );
	T::is( Quality::check( '太短', 500 )['ok'], false );
	T::is( Quality::check( fake_body( 700 ) . '加油，你可以的', 500 )['ok'], false );
	T::is( Quality::check( fake_body( 700 ) . '**粗體**', 500 )['ok'], false );
	// 略短一成仍放行：模型字數控制本就不精準
	T::ok( Quality::check( fake_body( 460 ), 500 )['ok'], '差一點不該整章重生成' );
} );

/* ---------- DeepSeek 用戶端 ---------- */

T::test( '請求帶上金鑰、JSON 模式，並拆成 system 與 user 兩段', function () {
	$calls = array();
	$transport = fake_transport( $calls, function () {
		return array( 'code' => 200, 'body' => json_encode( array( 'choices' => array( array( 'message' => array( 'content' => '{"body":"x"}' ) ) ) ) ) );
	} );
	$client = new DeepSeek( $transport, 'sk-test', 'deepseek-chat' );
	$out = $client->complete( '前綴', '指令' );

	T::is( $out['content'], '{"body":"x"}' );
	$sent = json_decode( $calls[0]['args']['body'], true );
	T::is( $sent['messages'][0]['role'], 'system' );
	T::is( $sent['messages'][0]['content'], '前綴' );
	T::is( $sent['messages'][1]['content'], '指令' );
	T::is( $sent['response_format']['type'], 'json_object' );
	T::is( $calls[0]['args']['headers']['Authorization'], 'Bearer sk-test' );
} );

T::test( '非 200 與格式異常都丟出例外，且錯誤訊息不含金鑰', function () {
	$calls = array();
	$client = new DeepSeek( fake_transport( $calls, function () {
		return array( 'code' => 402, 'body' => 'Insufficient Balance' );
	} ), 'sk-secret' );
	try {
		$client->complete( 'a', 'b' );
		throw new Exception( '應該丟出例外' );
	} catch ( RuntimeException $e ) {
		T::ok( false !== strpos( $e->getMessage(), '402' ) );
		T::ok( false === strpos( $e->getMessage(), 'sk-secret' ), '錯誤訊息不可外流金鑰' );
	}

	$client2 = new DeepSeek( fake_transport( $calls, function () {
		return array( 'code' => 200, 'body' => '{}' );
	} ), 'k' );
	T::throws( function () use ( $client2 ) { $client2->complete( 'a', 'b' ); }, '格式不符' );

	$client3 = new DeepSeek( fake_transport( $calls, function () {
		return array( 'code' => 200, 'body' => '{}' );
	} ), '' );
	T::throws( function () use ( $client3 ) { $client3->complete( 'a', 'b' ); }, '尚未設定' );
} );

/* ---------- Gumroad 閘門 ---------- */

T::test( '授權驗證：有效、退款、無效三種情形', function () {
	$calls = array();
	$ok = new Gumroad( fake_transport( $calls, function () {
		return array( 'code' => 200, 'body' => json_encode( array( 'success' => true, 'purchase' => array( 'email' => 'a@b.com', 'order_number' => '123' ) ) ) );
	} ), 'prod_1' );
	$result = $ok->verify( 'LICENSE-1' );
	T::ok( $result['valid'] );
	T::is( $result['email'], 'a@b.com' );
	// 不可增加 Gumroad 的使用次數：次數由我們自己控管，買家才能重看報告
	T::ok( false !== strpos( $calls[0]['args']['body'], 'increment_uses_count=false' ) );

	$refunded = new Gumroad( fake_transport( $calls, function () {
		return array( 'code' => 200, 'body' => json_encode( array( 'success' => true, 'purchase' => array( 'refunded' => true ) ) ) );
	} ), 'prod_1' );
	T::is( $refunded->verify( 'L' )['valid'], false );
	T::ok( false !== strpos( $refunded->verify( 'L' )['reason'], '退款' ) );

	$bad = new Gumroad( fake_transport( $calls, function () {
		return array( 'code' => 404, 'body' => '{"success":false}' );
	} ), 'prod_1' );
	T::is( $bad->verify( 'L' )['valid'], false );
	T::is( $ok->verify( '' )['valid'], false );
} );

/* ---------- 任務狀態機 ---------- */

function make_jobs( &$calls, callable $responder, $now = 1000 ) {
	$store  = new MemoryStore();
	$client = new DeepSeek( fake_transport( $calls, $responder ), 'sk-test' );
	$clock  = function () use ( &$now ) { return $now; };
	return array( new Jobs( $store, $client, $clock ), $store );
}

function good_response() {
	return function () {
		return array(
			'code' => 200,
			'body' => json_encode( array( 'choices' => array( array( 'message' => array( 'content' => json_encode( array( 'body' => fake_body( 750 ) ) ) ) ) ) ) ),
		);
	};
}

T::test( '同一位買家的同一份結果只會建立一個任務', function () {
	$calls = array();
	list( $jobs ) = make_jobs( $calls, good_response() );
	$first  = $jobs->create_or_get( 'LIC-1', sample_result() );
	$second = $jobs->create_or_get( 'LIC-1', sample_result() );
	T::ok( $first['created'] );
	T::is( $second['created'], false );
	T::is( $second['job']['job_key'], $first['job']['job_key'] );
} );

T::test( '同一組授權碼超過生成上限後被擋下', function () {
	$calls = array();
	list( $jobs ) = make_jobs( $calls, good_response() );
	for ( $i = 0; $i < Jobs::MAX_PER_LICENSE; $i++ ) {
		$r = sample_result();
		$r['code'] = '11111' . $i;
		T::ok( $jobs->create_or_get( 'LIC-2', $r )['created'] );
	}
	$r = sample_result();
	$r['code'] = '999999';
	$blocked = $jobs->create_or_get( 'LIC-2', $r );
	T::is( $blocked['created'], false );
	T::ok( false !== strpos( $blocked['error'], '上限' ) );
} );

T::test( '每次只生成一段，六步之後完成——這正是避開逾時的關鍵', function () {
	$calls = array();
	list( $jobs, $store ) = make_jobs( $calls, good_response() );
	$job_key = $jobs->create_or_get( 'LIC-3', sample_result() )['job']['job_key'];

	$outcome = $jobs->step( $job_key );
	T::is( $outcome['done'], false );
	T::is( count( $calls ), 1, '一次 step 只能呼叫模型一次' );
	T::is( count( $store->find( $job_key )['chapters'] ), 1 );

	for ( $i = 0; $i < 5; $i++ ) {
		$outcome = $jobs->step( $job_key );
	}
	T::is( $outcome['done'], true );
	T::is( count( $calls ), Jobs::total_steps(), '總呼叫次數應等於總步數' );

	$job = $store->find( $job_key );
	T::is( $job['status'], Jobs::STATUS_DONE );
	T::is( count( $job['chapters'] ), 5 );
	T::ok( '' !== $job['message'] );
	T::is( $job['chapters'][0]['key'], 'state' );
	T::is( $job['chapters'][4]['key'], 'scripts' );

	// 完成後再呼叫不會重複花錢
	$jobs->step( $job_key );
	T::is( count( $calls ), Jobs::total_steps(), '完成後不應再呼叫模型' );
} );

T::test( '處理中的任務被鎖住，另一個行程不會重複生成', function () {
	$calls = array();
	list( $jobs, $store ) = make_jobs( $calls, good_response() );
	$job_key = $jobs->create_or_get( 'LIC-4', sample_result() )['job']['job_key'];

	$store->update( $job_key, array( 'locked_at' => 1000, 'status' => Jobs::STATUS_PROCESSING ) );
	$outcome = $jobs->step( $job_key );
	T::is( $outcome['skipped'], true );
	T::is( count( $calls ), 0, '被鎖住時不該呼叫模型' );
} );

T::test( '品質不合格會重寫，連續三次失敗才判定失敗', function () {
	$calls = array();
	list( $jobs, $store ) = make_jobs( $calls, function () {
		return array(
			'code' => 200,
			'body' => json_encode( array( 'choices' => array( array( 'message' => array( 'content' => '{"body":"太短了，而且加油"}' ) ) ) ) ),
		);
	} );
	$job_key = $jobs->create_or_get( 'LIC-5', sample_result() )['job']['job_key'];

	$first = $jobs->step( $job_key );
	T::is( $first['status'], Jobs::STATUS_QUEUED, '第一次不合格應退回佇列重試' );
	T::is( $store->find( $job_key )['attempts'], 1 );

	$jobs->step( $job_key );
	$third = $jobs->step( $job_key );
	T::is( $third['status'], Jobs::STATUS_FAILED );
	T::is( $store->find( $job_key )['step'], 0, '失敗時不應推進進度' );

	// 重試時要帶上更嚴格的指令
	$second_instruction = json_decode( $calls[1]['args']['body'], true )['messages'][1]['content'];
	T::ok( false !== strpos( $second_instruction, '重寫' ) );
} );

T::test( '卡住的任務可被輪詢接手，這是共享主機上的自我修復機制', function () {
	$now = 5000;
	$queued = array( 'status' => Jobs::STATUS_PROCESSING, 'locked_at' => $now - 10, 'updated_at' => $now - 10 );
	T::is( Jobs::is_stalled( $queued, $now ), false );

	$stuck = array( 'status' => Jobs::STATUS_PROCESSING, 'locked_at' => $now - 300, 'updated_at' => $now - 300 );
	T::ok( Jobs::is_stalled( $stuck, $now ), '鎖太久應視為卡住' );

	$never_started = array( 'status' => Jobs::STATUS_QUEUED, 'locked_at' => 0, 'updated_at' => $now - 60 );
	T::ok( Jobs::is_stalled( $never_started, $now ), 'loopback 沒被觸發時應由輪詢推進' );

	$done = array( 'status' => Jobs::STATUS_DONE, 'locked_at' => 0, 'updated_at' => 0 );
	T::is( Jobs::is_stalled( $done, $now ), false );
} );

T::test( '進度資料讓前端逐章顯示', function () {
	$calls = array();
	list( $jobs, $store ) = make_jobs( $calls, good_response() );
	$job_key = $jobs->create_or_get( 'LIC-6', sample_result() )['job']['job_key'];
	$jobs->step( $job_key );
	$jobs->step( $job_key );

	$progress = Jobs::progress( $store->find( $job_key ) );
	T::is( $progress['total'], 6 );
	T::is( $progress['step'], 2 );
	T::is( $progress['percent'], 33 );
	T::is( count( $progress['chapters'] ), 2, '未完成時也要能取回已生成的章節' );
} );

/* ---------- 報告組裝 ---------- */

T::test( '骨架由模板產出，只有章節與寄語來自模型', function () {
	$calls = array();
	list( $jobs, $store ) = make_jobs( $calls, good_response() );
	$job_key = $jobs->create_or_get( 'LIC-7', sample_result() )['job']['job_key'];
	for ( $i = 0; $i < Jobs::total_steps(); $i++ ) {
		$jobs->step( $job_key );
	}
	$job = $store->find( $job_key );

	$sections = ReportBuilder::sections( $job );
	T::is( $sections[0]['type'], 'cover' );
	T::is( $sections[1]['type'], 'coordinates' );
	T::ok( false !== strpos( $sections[1]['body'], '= 61' ), '座標頁的公式應由程式算出，不經模型' );
	T::is( count( $sections ), 2 + 5 + 1 );
	T::is( $sections[2]['title'], '第 1 章　你此刻的系統狀態' );

	$pages = ReportBuilder::estimate_pages( $job );
	T::ok( $pages >= 10 && $pages <= 20, '頁數應落在合理範圍，實得 ' . $pages );
} );

T::test( '段落切分會濾掉空行', function () {
	T::is( ReportBuilder::paragraphs( "第一段\n\n第二段\n" ), array( '第一段', '第二段' ) );
} );

/* ---------- 報告樣板 ---------- */

T::test( '報告樣板輸出完整內容，且使用者資料經過跳脫', function () {
	$calls = array();
	list( $jobs, $store ) = make_jobs( $calls, good_response() );
	$job_key = $jobs->create_or_get( 'LIC-8', sample_result() )['job']['job_key'];
	for ( $i = 0; $i < Jobs::total_steps(); $i++ ) {
		$jobs->step( $job_key );
	}

	$job = $store->find( $job_key );
	// 模擬含有 HTML 的內容，確認不會直接輸出到頁面上
	$chapters = $job['chapters'];
	$chapters[0]['body'] = '<script>alert(1)</script>' . fake_body( 700 );
	$store->update( $job_key, array( 'chapters' => $chapters ) );
	$job = $store->find( $job_key );

	$sections = ReportBuilder::sections( $job );
	$pages    = ReportBuilder::estimate_pages( $job );
	$audio    = 'https://example.com/a.mp3';

	ob_start();
	require __DIR__ . '/../templates/report.php';
	$html = ob_get_clean();

	T::ok( false !== strpos( $html, '自洽躍遷破局手冊' ), '應有標題' );
	T::ok( false !== strpos( $html, '次生擾動型' ), '應有原型' );
	T::ok( false !== strpos( $html, '第 1 章' ), '應有章節' );
	T::ok( false !== strpos( $html, '寄語' ), '應有寄語' );
	T::ok( false !== strpos( $html, '全書 ' . $pages . ' 頁' ), '應顯示實算頁數' );
	T::ok( false !== strpos( $html, '<audio' ), '有錄音時應顯示語音區塊' );
	T::ok( false === strpos( $html, '<script>alert(1)</script>' ), '章節內容必須跳脫' );
	T::ok( false !== strpos( $html, '&lt;script&gt;' ), '應以跳脫後的形式出現' );
	T::ok( false !== strpos( $html, 'is-bottleneck' ), '瓶頸維度應被標示' );
} );

T::summary();
