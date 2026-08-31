<?php
/**
 * 永恆之子整椎中心 · 預約收單程式（WordPress 版）
 * Eternity's Child Chiropractic — booking receiver for WordPress
 *
 * 用法：
 *   1. 把這個檔案上傳到網站根目錄底下的 /eternitychildbooking/ 資料夾
 *      （也就是跟 index.html 放在一起）。
 *   2. 在 config.js 把 endpoint 設成：
 *        endpoint: '/eternitychildbooking/booking-submit.php'
 *   3. 完成。預約送出後會直接寄到 $CENTER_EMAIL，
 *      同時寄一封確認信給客人（用客人選的語言）。
 *
 * 這支程式會載入 WordPress 來使用 wp_mail()，
 * 因此會沿用網站既有的寄信設定（例如 WP Mail SMTP 外掛），
 * 比 PHP 內建的 mail() 可靠很多、也比較不會進垃圾信匣。
 */

$CENTER_EMAIL = 'ahanamita88888888@gmail.com';   // 中心收件信箱
$CENTER_NAME  = '永恆之子整椎中心';
$MAX_PER_HOUR = 8;                               // 同一 IP 每小時最多幾筆，防灌水

/* ---------- 載入 WordPress（往上找 wp-load.php） ---------- */
$dir = __DIR__;
for ($i = 0; $i < 5; $i++) {
    if (file_exists($dir . '/wp-load.php')) { require_once $dir . '/wp-load.php'; break; }
    $dir = dirname($dir);
}

header('Content-Type: application/json; charset=utf-8');

function fail($msg, $code = 400) {
    http_response_code($code);
    echo json_encode(['ok' => false, 'error' => $msg], JSON_UNESCAPED_UNICODE);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') fail('method_not_allowed', 405);
if (!function_exists('wp_mail')) fail('wordpress_not_loaded', 500);

/* ---------- 防灌水 ---------- */
$ip  = isset($_SERVER['REMOTE_ADDR']) ? $_SERVER['REMOTE_ADDR'] : '0';
$key = 'ecc_booking_' . md5($ip);
$hits = (int) get_transient($key);
if ($hits >= $MAX_PER_HOUR) fail('too_many_requests', 429);
set_transient($key, $hits + 1, HOUR_IN_SECONDS);

/* ---------- 讀取並檢查資料 ---------- */
$raw = file_get_contents('php://input');
if (strlen($raw) > 20000) fail('payload_too_large', 413);
$d = json_decode($raw, true);
if (!is_array($d)) fail('invalid_json');

$clip = function ($v, $len) { return mb_substr(sanitize_text_field((string) $v), 0, $len); };

$ref      = $clip(isset($d['ref']) ? $d['ref'] : '', 32);
$name     = $clip(isset($d['name']) ? $d['name'] : '', 80);
$phone    = $clip(isset($d['phone']) ? $d['phone'] : '', 32);
$email    = sanitize_email(isset($d['email']) ? $d['email'] : '');
$date     = $clip(isset($d['date']) ? $d['date'] : '', 10);
$start    = $clip(isset($d['startTime']) ? $d['startTime'] : '', 5);
$end      = $clip(isset($d['endTime']) ? $d['endTime'] : '', 5);
$service  = $clip(isset($d['serviceLabel']) ? $d['serviceLabel'] : '', 40);
$visit    = (isset($d['visit']) && $d['visit'] === 'first') ? '初診' : '回診';
$minutes  = (int) (isset($d['durationMinutes']) ? $d['durationMinutes'] : 0);
$price    = (int) (isset($d['price']) ? $d['price'] : 0);
$lang     = in_array(isset($d['preferredLanguage']) ? $d['preferredLanguage'] : '', ['zh','en','ja','ko'], true)
            ? $d['preferredLanguage'] : 'zh';
$notes    = mb_substr(sanitize_textarea_field(isset($d['notes']) ? $d['notes'] : ''), 0, 1000);

if ($name === '' || $phone === '' || !is_email($email)) fail('missing_fields');
if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $date))        fail('bad_date');
if (!preg_match('/^\d{2}:\d{2}$/', $start))             fail('bad_time');

/* ---------- 寄給中心 ---------- */
$lines = [
    "預約編號：$ref",
    "",
    "日期時間：$date  $start–$end（台北時間）",
    "服務項目：$service",
    "看診類型：$visit",
    "療程時長：$minutes 分鐘",
    "費用：NT$ " . number_format($price),
    "",
    "姓名：$name",
    "電話：$phone",
    "Email：$email",
    "溝通語言：$lang",
    "備註：" . ($notes !== '' ? $notes : '—'),
    "",
    "送出時間：" . current_time('Y-m-d H:i:s'),
    "來源 IP：$ip",
];
$headers = ['Content-Type: text/plain; charset=UTF-8', 'Reply-To: ' . $name . ' <' . $email . '>'];
$sent = wp_mail($CENTER_EMAIL, "[新預約 $ref] $date $start $name", implode("\n", $lines), $headers);

/* ---------- 寄確認信給客人（依其選擇的語言） ---------- */
$T = [
    'zh' => [
        'subject' => "【$CENTER_NAME】預約申請已收到（$ref）",
        'hello'   => "$name 您好：",
        'body'    => "我們已收到您的預約申請，將於一個工作天內與您確認。",
        'detail'  => "預約明細",
        'pay'     => "付款方式：臺灣銀行（004）帳號 013004490011。確認後請於三日內完成轉帳，並保留後五碼以利核對。",
        'foot'    => "如需改期或取消，請於預約日前 48 小時與我們聯繫。",
    ],
    'en' => [
        'subject' => "[$CENTER_NAME] Booking request received ($ref)",
        'hello'   => "Dear $name,",
        'body'    => "We have received your booking request and will confirm within one business day.",
        'detail'  => "Booking details",
        'pay'     => "Payment: Bank of Taiwan (004), account 013004490011. Please transfer within three days of confirmation and keep the last five digits for reconciliation.",
        'foot'    => "To reschedule or cancel, please contact us at least 48 hours in advance.",
    ],
    'ja' => [
        'subject' => "【$CENTER_NAME】ご予約を受け付けました（$ref）",
        'hello'   => "$name 様",
        'body'    => "ご予約申込を受け付けました。1営業日以内にご連絡いたします。",
        'detail'  => "ご予約内容",
        'pay'     => "お支払い：台湾銀行（004）口座 013004490011。確定後3日以内にお振込みいただき、下5桁をお控えください。",
        'foot'    => "変更・キャンセルは予約日の48時間前までにご連絡ください。",
    ],
    'ko' => [
        'subject' => "[$CENTER_NAME] 예약 신청이 접수되었습니다 ($ref)",
        'hello'   => "$name 님께",
        'body'    => "예약 신청을 접수했습니다. 영업일 기준 1일 이내에 연락드리겠습니다.",
        'detail'  => "예약 내용",
        'pay'     => "결제: 대만은행(004) 계좌 013004490011. 확정 후 3일 이내에 이체해 주시고 뒤 5자리를 보관해 주세요.",
        'foot'    => "변경 및 취소는 예약일 48시간 전까지 연락해 주세요.",
    ],
];
$t = $T[$lang];
$customer = implode("\n", [
    $t['hello'], '',
    $t['body'], '',
    $t['detail'] . '：',
    "  $date  $start–$end",
    "  $service / $minutes min / NT$ " . number_format($price),
    "  $ref", '',
    $t['pay'], '',
    $t['foot'], '',
    $CENTER_NAME,
]);
wp_mail($email, $t['subject'], $customer, ['Content-Type: text/plain; charset=UTF-8']);

echo json_encode(['ok' => (bool) $sent, 'ref' => $ref], JSON_UNESCAPED_UNICODE);
