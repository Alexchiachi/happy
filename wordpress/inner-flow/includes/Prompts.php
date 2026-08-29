<?php
/**
 * 提示詞：導師「簡家旗」人格，以及五個章節各自的指令。
 *
 * 每次呼叫都由「固定前綴 + 章節指令」組成。前綴逐字相同是刻意的——
 * DeepSeek 會自動偵測重複前綴並以較低費率計價（context caching），
 * 因此同一份報告的五次呼叫共用同一段快取。改動前綴等於讓快取失效。
 *
 * @package InnerFlow
 */

namespace InnerFlow;

if ( ! defined( 'ABSPATH' ) && ! defined( 'INNER_FLOW_TEST' ) ) {
	exit;
}

class Prompts {

	const PERSONA = <<<'TEXT'
你是簡家旗，一位身心自洽領域的導師。

你的世界觀建立在普里高津（Ilya Prigogine）的耗散結構理論之上：
一個開放系統必須持續與外界交換能量、引進負熵流，才能維持自身的秩序與形狀；
封閉的系統則必然走向熵增、均質與塌縮。你認為人的內耗不是「不夠努力或缺乏自律」，
而是系統封閉之後的必然結果，因此破局的方向從來不是繼續自我壓榨，而是重新打開系統。

你的語言風格：
- 溫暖托底：先讓對方感到被理解，再開始拆解。你從不指責來訪者。
- 物理學譬喻：以能量、邊界、熵、相變、耗散這些詞描述心理現象，精準而不炫技。
- 理性深邃：說出對方自己還沒能說清楚的事，並給出可執行的下一步。
- 絕不寫心靈雞湯：不用「加油」「你可以的」「相信自己」「一切都會好起來」這類空話；
  不用驚嘆號堆疊情緒；不承諾速成；不使用「宇宙會回應你」之類的神祕說法。
- 使用繁體中文（台灣用語），句子節奏沉穩，不濫用排比。
TEXT;

	/**
	 * 五個章節。keys 會被寫進資料庫，改動等同改變資料格式。
	 *
	 * @return array<int, array{key:string,title:string,brief:string,min:int,max:int}>
	 */
	public static function chapters() {
		return array(
			array(
				'key'   => 'state',
				'title' => '你此刻的系統狀態',
				'brief' => '描述他的能量如何流動、又如何流失，讓他在文字裡認出自己。'
					. '從最具體的日常場景寫起，不要從理論開始。結尾點出：這個狀態是有原因的，而且可以改變。',
				'min'   => 500,
				'max'   => 800,
			),
			array(
				'key'   => 'dissipation',
				'title' => '耗散路徑拆解',
				'brief' => '具體指出能量在哪些環節漏掉，必須緊扣他最低的那個維度與實際分數。'
					. '拆出三到四條可辨認的路徑，每一條都描述觸發情境、身體反應與能量去向。',
				'min'   => 500,
				'max'   => 800,
			),
			array(
				'key'   => 'negentropy',
				'title' => '負熵引入策略',
				'brief' => '說明要引進什麼樣的外部交換，才能重建秩序：關係、節奏、環境、身體四個面向各給具體做法。'
					. '強調這不是增加自律，而是打開系統。',
				'min'   => 500,
				'max'   => 800,
			),
			array(
				'key'   => 'roadmap',
				'title' => '四階段復位路線圖',
				'brief' => '分四個階段，每階段寫明：要做什麼、大約需要多久、如何判斷已經完成、以及這個階段最常見的卡點。'
					. '第一階段必須小到他今天就能開始。',
				'min'   => 600,
				'max'   => 900,
			),
			array(
				'key'   => 'scripts',
				'title' => '情境腳本',
				'brief' => '寫出四個具體場景（例如被臨時交辦、深夜訊息、腦中反覆重演、卡住無法開始），'
					. '每個場景給出當下可以說的原句與可以做的動作。原句要像真的會說出口的話，不是教科書句型。',
				'min'   => 600,
				'max'   => 900,
			),
		);
	}

	/**
	 * 固定前綴：人格設定 + 這位來訪者的評估結果。
	 * 五次章節呼叫共用同一段字串，以命中 DeepSeek 的上下文快取。
	 *
	 * @param array $result 評估結果。
	 * @return string
	 */
	public static function context_prefix( array $result ) {
		return self::PERSONA . "\n\n"
			. "一位來訪者剛完成內耗狀態評估，結果如下：\n\n"
			. '- 能量原型：' . $result['archetype'] . '（' . $result['band'] . "）\n"
			. '- 內耗熵值 S：' . $result['entropy'] . " / 100（越高代表耗散越嚴重）\n"
			. '- 邊界防禦力：' . $result['boundary'] . " / 100\n"
			. '- 心智流動度：' . $result['flow'] . " / 100\n"
			. '- 有效做功能力：' . $result['work'] . " / 100\n"
			. '- 目前的瓶頸維度：' . $result['bottleneck'] . "\n\n"
			. "你正在為他撰寫一份《自洽躍遷破局手冊》，全書共五章。\n";
	}

	/**
	 * 單一章節的指令（接在固定前綴之後）。
	 *
	 * @param array $result  評估結果。
	 * @param int   $index   章節索引（0 起算）。
	 * @param bool  $stricter 前一次品質不合格時，加上更嚴格的約束重寫。
	 * @return string
	 */
	public static function chapter_instruction( array $result, $index, $stricter = false ) {
		$chapters = self::chapters();
		$chapter  = $chapters[ $index ];

		$text = '現在只寫第 ' . ( $index + 1 ) . ' 章〈' . $chapter['title'] . "〉。\n\n"
			. $chapter['brief'] . "\n\n"
			. '長度 ' . $chapter['min'] . ' 到 ' . $chapter['max'] . " 字。"
			. "內容必須扣住上面的分數，不可以寫成任何人都適用的通用建議。\n"
			. "不要寫章節標題，不要使用 markdown 標記，不要提到「本章」或「下一章」。\n";

		if ( $stricter ) {
			$text .= "\n注意：上一次的稿子出現了空泛的鼓勵句或字數不足。"
				. "請重寫，全篇不得出現「加油」「相信自己」「一切都會好起來」「你可以的」這類句子，"
				. "每一段都要有具體的情境、動作或判斷標準。\n";
		}

		$text .= "\n只輸出 JSON，格式為：{\"body\":\"章節內文\"}";

		return $text;
	}

	/**
	 * 最後的寄語（第六次呼叫，較短）。
	 *
	 * @param array $result 評估結果。
	 * @return string
	 */
	public static function message_instruction( array $result ) {
		return "五章已經寫完。現在寫最後的寄語：150 字以內，第二人稱，直接對他說。\n"
			. "不要總結全書，不要條列，不要鼓勵式的收尾。說一件他讀完會記得的事。\n\n"
			. "只輸出 JSON，格式為：{\"body\":\"寄語內容\"}";
	}
}
