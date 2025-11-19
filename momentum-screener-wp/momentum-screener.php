<?php
/**
 * Plugin Name: Momentum Screener для российских акций
 * Plugin URI: https://github.com/momentum-screener
 * Description: Скринер моментума для российского рынка акций с бэктестингом и рекомендациями
 * Version: 1.0.0
 * Author: Momentum Screener Team
 * Author URI: https://github.com/momentum-screener
 * License: GPL v2 or later
 * License URI: https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain: momentum-screener
 * Domain Path: /languages
 */

// Prevent direct access
if (!defined('ABSPATH')) {
    exit;
}

// Define plugin constants
define('MOMENTUM_SCREENER_VERSION', '1.0.0');
define('MOMENTUM_SCREENER_PLUGIN_DIR', plugin_dir_path(__FILE__));
define('MOMENTUM_SCREENER_PLUGIN_URL', plugin_dir_url(__FILE__));

/**
 * Main Plugin Class
 */
class Momentum_Screener {

    private static $instance = null;

    /**
     * Get singleton instance
     */
    public static function get_instance() {
        if (null === self::$instance) {
            self::$instance = new self();
        }
        return self::$instance;
    }

    /**
     * Constructor
     */
    private function __construct() {
        $this->init_hooks();
    }

    /**
     * Initialize hooks
     */
    private function init_hooks() {
        // Admin hooks
        add_action('admin_menu', array($this, 'add_admin_menu'));
        add_action('admin_init', array($this, 'register_settings'));
        add_action('admin_enqueue_scripts', array($this, 'enqueue_admin_scripts'));

        // Frontend hooks
        add_action('wp_enqueue_scripts', array($this, 'enqueue_frontend_scripts'));
        add_shortcode('momentum_screener', array($this, 'render_shortcode'));

        // AJAX hooks
        add_action('wp_ajax_momentum_fetch_data', array($this, 'ajax_fetch_data'));
        add_action('wp_ajax_nopriv_momentum_fetch_data', array($this, 'ajax_fetch_data'));
    }

    /**
     * Add admin menu
     */
    public function add_admin_menu() {
        add_options_page(
            __('Momentum Screener', 'momentum-screener'),
            __('Momentum Screener', 'momentum-screener'),
            'manage_options',
            'momentum-screener',
            array($this, 'render_admin_page')
        );
    }

    /**
     * Register settings
     */
    public function register_settings() {
        register_setting('momentum_screener_options', 'momentum_screener_settings', array(
            'sanitize_callback' => array($this, 'sanitize_settings')
        ));

        add_settings_section(
            'momentum_screener_main',
            __('Настройки источника данных', 'momentum-screener'),
            array($this, 'settings_section_callback'),
            'momentum-screener'
        );

        add_settings_field(
            'google_sheet_url',
            __('URL Google Sheets (CSV)', 'momentum-screener'),
            array($this, 'google_sheet_url_callback'),
            'momentum-screener',
            'momentum_screener_main'
        );

        add_settings_field(
            'dividend_sheet_url',
            __('URL дивидендов (CSV)', 'momentum-screener'),
            array($this, 'dividend_sheet_url_callback'),
            'momentum-screener',
            'momentum_screener_main'
        );

        add_settings_field(
            'cache_duration',
            __('Время кэширования (минуты)', 'momentum-screener'),
            array($this, 'cache_duration_callback'),
            'momentum-screener',
            'momentum_screener_main'
        );

        add_settings_field(
            'default_lookback',
            __('Период расчета по умолчанию (мес)', 'momentum-screener'),
            array($this, 'default_lookback_callback'),
            'momentum-screener',
            'momentum_screener_main'
        );

        add_settings_field(
            'default_holding',
            __('Период удержания по умолчанию (мес)', 'momentum-screener'),
            array($this, 'default_holding_callback'),
            'momentum-screener',
            'momentum_screener_main'
        );

        add_settings_field(
            'default_topn',
            __('Количество акций по умолчанию', 'momentum-screener'),
            array($this, 'default_topn_callback'),
            'momentum-screener',
            'momentum_screener_main'
        );
    }

    /**
     * Sanitize settings
     */
    public function sanitize_settings($input) {
        $sanitized = array();

        if (isset($input['google_sheet_url'])) {
            $sanitized['google_sheet_url'] = esc_url_raw($input['google_sheet_url']);
        }

        if (isset($input['dividend_sheet_url'])) {
            $sanitized['dividend_sheet_url'] = esc_url_raw($input['dividend_sheet_url']);
        }

        if (isset($input['cache_duration'])) {
            $sanitized['cache_duration'] = absint($input['cache_duration']);
        }

        if (isset($input['default_lookback'])) {
            $sanitized['default_lookback'] = min(12, max(1, absint($input['default_lookback'])));
        }

        if (isset($input['default_holding'])) {
            $sanitized['default_holding'] = min(6, max(1, absint($input['default_holding'])));
        }

        if (isset($input['default_topn'])) {
            $sanitized['default_topn'] = min(30, max(5, absint($input['default_topn'])));
        }

        return $sanitized;
    }

    /**
     * Settings section callback
     */
    public function settings_section_callback() {
        echo '<p>' . esc_html__('Укажите URL Google Sheets для загрузки данных о ценах акций. Используйте формат CSV экспорта.', 'momentum-screener') . '</p>';
        echo '<p><strong>' . esc_html__('Формат URL:', 'momentum-screener') . '</strong> https://docs.google.com/spreadsheets/d/{ID}/export?format=csv&gid={SHEET_ID}</p>';
    }

    /**
     * Google Sheet URL field callback
     */
    public function google_sheet_url_callback() {
        $options = get_option('momentum_screener_settings');
        $value = isset($options['google_sheet_url']) ? $options['google_sheet_url'] : '';
        echo '<input type="url" name="momentum_screener_settings[google_sheet_url]" value="' . esc_attr($value) . '" class="regular-text" />';
        echo '<p class="description">' . esc_html__('URL CSV экспорта листа "цены"', 'momentum-screener') . '</p>';
    }

    /**
     * Dividend Sheet URL field callback
     */
    public function dividend_sheet_url_callback() {
        $options = get_option('momentum_screener_settings');
        $value = isset($options['dividend_sheet_url']) ? $options['dividend_sheet_url'] : '';
        echo '<input type="url" name="momentum_screener_settings[dividend_sheet_url]" value="' . esc_attr($value) . '" class="regular-text" />';
        echo '<p class="description">' . esc_html__('URL CSV экспорта листа дивидендов (опционально)', 'momentum-screener') . '</p>';
    }

    /**
     * Cache duration field callback
     */
    public function cache_duration_callback() {
        $options = get_option('momentum_screener_settings');
        $value = isset($options['cache_duration']) ? $options['cache_duration'] : 60;
        echo '<input type="number" name="momentum_screener_settings[cache_duration]" value="' . esc_attr($value) . '" min="1" max="1440" class="small-text" />';
        echo '<p class="description">' . esc_html__('Как долго кэшировать данные (1-1440 минут)', 'momentum-screener') . '</p>';
    }

    /**
     * Default lookback field callback
     */
    public function default_lookback_callback() {
        $options = get_option('momentum_screener_settings');
        $value = isset($options['default_lookback']) ? $options['default_lookback'] : 3;
        echo '<input type="number" name="momentum_screener_settings[default_lookback]" value="' . esc_attr($value) . '" min="1" max="12" class="small-text" />';
    }

    /**
     * Default holding field callback
     */
    public function default_holding_callback() {
        $options = get_option('momentum_screener_settings');
        $value = isset($options['default_holding']) ? $options['default_holding'] : 1;
        echo '<input type="number" name="momentum_screener_settings[default_holding]" value="' . esc_attr($value) . '" min="1" max="6" class="small-text" />';
    }

    /**
     * Default topN field callback
     */
    public function default_topn_callback() {
        $options = get_option('momentum_screener_settings');
        $value = isset($options['default_topn']) ? $options['default_topn'] : 10;
        echo '<input type="number" name="momentum_screener_settings[default_topn]" value="' . esc_attr($value) . '" min="5" max="30" class="small-text" />';
    }

    /**
     * Render admin page
     */
    public function render_admin_page() {
        if (!current_user_can('manage_options')) {
            return;
        }
        ?>
        <div class="wrap">
            <h1><?php echo esc_html(get_admin_page_title()); ?></h1>

            <form action="options.php" method="post">
                <?php
                settings_fields('momentum_screener_options');
                do_settings_sections('momentum-screener');
                submit_button(__('Сохранить настройки', 'momentum-screener'));
                ?>
            </form>

            <hr>

            <h2><?php esc_html_e('Использование', 'momentum-screener'); ?></h2>
            <p><?php esc_html_e('Используйте шорткод на любой странице:', 'momentum-screener'); ?></p>
            <code>[momentum_screener]</code>

            <h3><?php esc_html_e('Параметры шорткода:', 'momentum-screener'); ?></h3>
            <ul>
                <li><code>lookback="3"</code> - <?php esc_html_e('Период расчета momentum (1-12 мес)', 'momentum-screener'); ?></li>
                <li><code>holding="1"</code> - <?php esc_html_e('Период удержания (1-6 мес)', 'momentum-screener'); ?></li>
                <li><code>topn="10"</code> - <?php esc_html_e('Количество акций в портфеле (5-30)', 'momentum-screener'); ?></li>
                <li><code>show_backtest="true"</code> - <?php esc_html_e('Показывать бэктест', 'momentum-screener'); ?></li>
            </ul>

            <h3><?php esc_html_e('Пример:', 'momentum-screener'); ?></h3>
            <code>[momentum_screener lookback="6" holding="1" topn="15" show_backtest="true"]</code>

            <hr>

            <h2><?php esc_html_e('Требования к данным Google Sheets', 'momentum-screener'); ?></h2>
            <ul>
                <li><?php esc_html_e('Первый столбец: Time (даты в формате YYYY-MM-DD)', 'momentum-screener'); ?></li>
                <li><?php esc_html_e('Остальные столбцы: тикеры акций с ценами', 'momentum-screener'); ?></li>
                <li><?php esc_html_e('Данные должны быть отсортированы по дате (по возрастанию)', 'momentum-screener'); ?></li>
                <li><?php esc_html_e('Каждая строка = один месяц', 'momentum-screener'); ?></li>
            </ul>
        </div>
        <?php
    }

    /**
     * Enqueue admin scripts
     */
    public function enqueue_admin_scripts($hook) {
        if ('settings_page_momentum-screener' !== $hook) {
            return;
        }

        wp_enqueue_style(
            'momentum-screener-admin',
            MOMENTUM_SCREENER_PLUGIN_URL . 'assets/css/admin.css',
            array(),
            MOMENTUM_SCREENER_VERSION
        );
    }

    /**
     * Enqueue frontend scripts
     */
    public function enqueue_frontend_scripts() {
        global $post;

        if (!is_a($post, 'WP_Post') || !has_shortcode($post->post_content, 'momentum_screener')) {
            return;
        }

        // Enqueue Chart.js
        wp_enqueue_script(
            'chartjs',
            'https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js',
            array(),
            '4.4.1',
            true
        );

        // Enqueue plugin styles
        wp_enqueue_style(
            'momentum-screener',
            MOMENTUM_SCREENER_PLUGIN_URL . 'assets/css/momentum-screener.css',
            array(),
            MOMENTUM_SCREENER_VERSION
        );

        // Enqueue plugin script
        wp_enqueue_script(
            'momentum-screener',
            MOMENTUM_SCREENER_PLUGIN_URL . 'assets/js/momentum-screener.js',
            array('jquery', 'chartjs'),
            MOMENTUM_SCREENER_VERSION,
            true
        );

        // Get settings
        $options = get_option('momentum_screener_settings');

        // Localize script
        wp_localize_script('momentum-screener', 'momentumScreener', array(
            'ajaxUrl' => admin_url('admin-ajax.php'),
            'nonce' => wp_create_nonce('momentum_screener_nonce'),
            'defaults' => array(
                'lookback' => isset($options['default_lookback']) ? intval($options['default_lookback']) : 3,
                'holding' => isset($options['default_holding']) ? intval($options['default_holding']) : 1,
                'topn' => isset($options['default_topn']) ? intval($options['default_topn']) : 10,
            ),
            'strings' => array(
                'loading' => __('Загрузка данных...', 'momentum-screener'),
                'error' => __('Ошибка загрузки данных', 'momentum-screener'),
                'noData' => __('Данные не найдены', 'momentum-screener'),
                'portfolioValue' => __('Стоимость портфеля', 'momentum-screener'),
                'periodReturn' => __('Доходность периода', 'momentum-screener'),
            )
        ));
    }

    /**
     * Render shortcode
     */
    public function render_shortcode($atts) {
        $options = get_option('momentum_screener_settings');

        $atts = shortcode_atts(array(
            'lookback' => isset($options['default_lookback']) ? $options['default_lookback'] : 3,
            'holding' => isset($options['default_holding']) ? $options['default_holding'] : 1,
            'topn' => isset($options['default_topn']) ? $options['default_topn'] : 10,
            'show_backtest' => 'true',
        ), $atts);

        ob_start();
        include MOMENTUM_SCREENER_PLUGIN_DIR . 'includes/shortcode-template.php';
        return ob_get_clean();
    }

    /**
     * AJAX handler for fetching data
     */
    public function ajax_fetch_data() {
        check_ajax_referer('momentum_screener_nonce', 'nonce');

        $options = get_option('momentum_screener_settings');

        if (empty($options['google_sheet_url'])) {
            wp_send_json_error(array(
                'message' => __('URL источника данных не настроен', 'momentum-screener')
            ));
        }

        // Check cache
        $cache_key = 'momentum_screener_data';
        $cached_data = get_transient($cache_key);

        if ($cached_data !== false) {
            wp_send_json_success($cached_data);
        }

        // Fetch price data
        $price_data = $this->fetch_csv_data($options['google_sheet_url']);

        if (is_wp_error($price_data)) {
            wp_send_json_error(array(
                'message' => $price_data->get_error_message()
            ));
        }

        // Fetch dividend data (optional)
        $dividend_data = null;
        if (!empty($options['dividend_sheet_url'])) {
            $dividend_data = $this->fetch_csv_data($options['dividend_sheet_url']);
            if (is_wp_error($dividend_data)) {
                $dividend_data = null;
            }
        }

        $data = array(
            'prices' => $price_data,
            'dividends' => $dividend_data
        );

        // Cache data
        $cache_duration = isset($options['cache_duration']) ? intval($options['cache_duration']) : 60;
        set_transient($cache_key, $data, $cache_duration * MINUTE_IN_SECONDS);

        wp_send_json_success($data);
    }

    /**
     * Fetch CSV data from URL
     */
    private function fetch_csv_data($url) {
        $response = wp_remote_get($url, array(
            'timeout' => 30,
            'sslverify' => false
        ));

        if (is_wp_error($response)) {
            return $response;
        }

        $body = wp_remote_retrieve_body($response);

        if (empty($body)) {
            return new WP_Error('empty_response', __('Пустой ответ от сервера', 'momentum-screener'));
        }

        // Parse CSV/TSV
        $lines = explode("\n", $body);
        $first_line = $lines[0];

        // Auto-detect delimiter (tab or comma)
        $delimiter = (strpos($first_line, "\t") !== false) ? "\t" : ",";

        $headers = str_getcsv(array_shift($lines), $delimiter);

        // Clean headers
        $headers = array_map('trim', $headers);

        $data = array();
        foreach ($lines as $line) {
            if (empty(trim($line))) {
                continue;
            }

            $values = str_getcsv($line, $delimiter);
            $row = array();

            foreach ($headers as $i => $header) {
                if (empty($header)) {
                    continue;
                }

                $value = isset($values[$i]) ? trim($values[$i]) : '';

                // Convert numeric values, handle empty cells
                if ($header !== 'Time') {
                    if ($value === '' || $value === null) {
                        $row[$header] = null;
                    } else {
                        // Replace comma with dot for decimals
                        $numeric_value = str_replace(',', '.', $value);
                        if (is_numeric($numeric_value)) {
                            $row[$header] = floatval($numeric_value);
                        } else {
                            $row[$header] = null;
                        }
                    }
                } else {
                    $row[$header] = $value;
                }
            }

            if (!empty($row) && isset($row['Time']) && !empty($row['Time'])) {
                $data[] = $row;
            }
        }

        return $data;
    }
}

// Initialize plugin
function momentum_screener_init() {
    return Momentum_Screener::get_instance();
}
add_action('plugins_loaded', 'momentum_screener_init');

// Activation hook
register_activation_hook(__FILE__, 'momentum_screener_activate');
function momentum_screener_activate() {
    // Set default options
    $defaults = array(
        'google_sheet_url' => '',
        'dividend_sheet_url' => '',
        'cache_duration' => 60,
        'default_lookback' => 3,
        'default_holding' => 1,
        'default_topn' => 10,
    );

    add_option('momentum_screener_settings', $defaults);
}

// Deactivation hook
register_deactivation_hook(__FILE__, 'momentum_screener_deactivate');
function momentum_screener_deactivate() {
    delete_transient('momentum_screener_data');
}
