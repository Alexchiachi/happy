<?php
/**
 * 報告組裝：把「每份都一樣的骨架」與「模型生成的個人化章節」合起來。
 *
 * 骨架（封面、能量座標、三維度定義、免責聲明）用模板產出，不花模型的錢，
 * 也不會有幻覺；只有真正因人而異的五章與寄語才交給模型。
 *
 * @package InnerFlow
 */

namespace InnerFlow;

if ( ! defined( 'ABSPATH' ) && ! defined( 'INNER_FLOW_TEST' ) ) {
	exit;
}

class ReportBuilder {

	/** A4、本頁排版下的每頁概略字數，用於估算頁數。 */
	const CHARS_PER_PAGE = 480;

	/** 模板頁：封面、能量座標、三維度定義、結語頁。 */
	const TEMPLATE_PAGES = 4;

	/** 三維度定義：固定內容，不需要模型生成。 */
	public static function dimensions() {
		return array(
			array(
				'name'  => '邊界防禦力',
				'desc'  => '你能不能決定什麼進得來、什麼進不來。這是最上游的一環——'
					. '邊界不修，後面兩項補多少都會漏回去。',
				'field' => 'boundary',
			),
			array(
				'name'  => '心智流動度',
				'desc'  => '事情結束之後，它能不能真的離開你。情緒代謝的速度、'
					. '以及大腦在空檔時是安靜還是自動重播。',
				'field' => 'flow',
			),
			array(
				'name'  => '有效做功能力',
				'desc'  => '你的投入有沒有留下痕跡。能量轉化的效率，'
					. '以及能不能在沒有把握時仍讓事情先存在。',
				'field' => 'work',
			),
		);
	}

	/**
	 * 完整報告的區段（依序即為閱讀順序）。
	 *
	 * @param array $job 任務資料。
	 * @return array<int, array{type:string,title:string,body:string}>
	 */
	public static function sections( array $job ) {
		$sections = array(
			array(
				'type'  => 'cover',
				'title' => '自洽躍遷破局手冊',
				'body'  => $job['archetype'],
			),
			array(
				'type'  => 'coordinates',
				'title' => '你的能量座標',
				'body'  => '內耗熵值 S = 100 −（' . (int) $job['boundary'] . ' + ' . (int) $job['flow']
					. ' + ' . (int) $job['work'] . '）/ 3 = ' . (int) $job['entropy'],
			),
		);

		$chapters = is_array( $job['chapters'] ) ? $job['chapters'] : array();
		foreach ( $chapters as $index => $chapter ) {
			$sections[] = array(
				'type'  => 'chapter',
				'title' => '第 ' . ( $index + 1 ) . ' 章　' . $chapter['title'],
				'body'  => $chapter['body'],
			);
		}

		if ( '' !== (string) $job['message'] ) {
			$sections[] = array(
				'type'  => 'message',
				'title' => '寄語',
				'body'  => (string) $job['message'],
			);
		}

		return $sections;
	}

	/**
	 * 依實際內容估算頁數——寫在報告首頁，也讓銷售頁的頁數說法有依據，
	 * 而不是憑空喊一個數字。
	 *
	 * @param array $job 任務資料。
	 * @return int
	 */
	public static function estimate_pages( array $job ) {
		$chars = 0;
		foreach ( ( is_array( $job['chapters'] ) ? $job['chapters'] : array() ) as $chapter ) {
			$chars += mb_strlen( $chapter['body'], 'UTF-8' );
		}
		$chars += mb_strlen( (string) $job['message'], 'UTF-8' );

		return self::TEMPLATE_PAGES + (int) ceil( $chars / self::CHARS_PER_PAGE );
	}

	/**
	 * 把章節內文拆成段落，供樣板逐段輸出。
	 *
	 * @param string $body 內文。
	 * @return array<int, string>
	 */
	public static function paragraphs( $body ) {
		$parts = preg_split( '/\R+/u', (string) $body );
		$out   = array();
		foreach ( (array) $parts as $part ) {
			$part = trim( $part );
			if ( '' !== $part ) {
				$out[] = $part;
			}
		}
		return $out;
	}
}
