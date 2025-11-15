<?php
/**
 * Plugin Name: Momentum Optimizer
 * Plugin URI: https://yoursite.com/momentum-optimizer
 * Description: Анализ momentum стратегий для российского рынка акций с загрузкой из Google Sheets
 * Version: 1.2.0 (Google Sheets Edition)
 * Author: Your Name
 * Author URI: https://yoursite.com
 * License: GPL v2 or later
 * Text Domain: momentum-optimizer
 */

// Защита от прямого доступа
if (!defined('ABSPATH')) {
    exit;
}

class MomentumOptimizerPlugin {
    
    private $plugin_path;
    private $plugin_url;
    
    public function __construct() {
        $this->plugin_path = plugin_dir_path(__FILE__);
        $this->plugin_url = plugin_dir_url(__FILE__);
        
        // Хуки
        add_action('wp_enqueue_scripts', array($this, 'enqueue_scripts'));
        add_shortcode('momentum_optimizer', array($this, 'render_shortcode'));
        
        // Админ меню
        add_action('admin_menu', array($this, 'add_admin_menu'));
        add_action('admin_enqueue_scripts', array($this, 'enqueue_admin_scripts'));
        
        // AJAX хуки
        add_action('wp_ajax_save_sheets_url', array($this, 'save_sheets_url'));
        add_action('wp_ajax_test_sheets_connection', array($this, 'test_sheets_connection'));
        add_action('wp_ajax_get_market_data', array($this, 'get_market_data'));
        add_action('wp_ajax_nopriv_get_market_data', array($this, 'get_market_data'));
    }
    
    /**
     * Добавление меню в админке
     */
    public function add_admin_menu() {
        add_menu_page(
            'Momentum Optimizer',
            'Momentum Opt',
            'manage_options',
            'momentum-optimizer',
            array($this, 'render_admin_page'),
            'dashicons-chart-line',
            30
        );
    }
    
    /**
     * Рендер админ страницы
     */
    public function render_admin_page() {
        if (!current_user_can('manage_options')) {
            wp_die('У вас нет прав доступа к этой странице.');
        }
        
        $sheets_url = get_option('momentum_optimizer_sheets_url', '');
        $last_update = get_option('momentum_optimizer_last_update', '');
        $market_data = get_option('momentum_optimizer_market_data', null);
        $stocks_count = $market_data && isset($market_data['stocks']) ? count($market_data['stocks']) : 0;
        
        ?>
        <div class="wrap">
            <h1>⚙️ Momentum Optimizer - Настройки Google Sheets</h1>
            
            <div class="card" style="max-width: 900px; margin-top: 20px;">
                <h2>📊 Подключение к Google Sheets</h2>
                
                <div class="notice notice-info inline" style="margin: 15px 0;">
                    <p><strong>ℹ️ Как настроить Google Sheets (ВАЖНО!):</strong></p>
                    <ol style="margin-left: 20px;">
                        <li>Загрузите ваш Excel файл в Google Sheets</li>
                        <li><strong>Файл → Опубликовать в Интернете</strong> (не "Настройки доступа"!)</li>
                        <li>Вкладка "Ссылка" → Выберите "Весь документ" → Формат "Веб-страница"</li>
                        <li>Нажмите <strong>"Опубликовать"</strong></li>
                        <li>Скопируйте обычную ссылку на таблицу из адресной строки</li>
                        <li>Вставьте ссылку ниже</li>
                    </ol>
                    <p style="margin-top: 10px; padding: 10px; background: #fff3cd; border-left: 4px solid #ffc107;">
                        <strong>⚠️ Частая ошибка:</strong> "Настройки доступа → Доступ по ссылке" НЕ ДОСТАТОЧНО!<br>
                        Нужно именно <strong>"Файл → Опубликовать в Интернете"</strong>
                    </p>
                </div>
                
                <?php if ($last_update): ?>
                    <div class="notice notice-success inline" style="margin: 15px 0;">
                        <p><strong>✅ Данные загружены:</strong> <?php echo esc_html($last_update); ?></p>
                        <p><strong>📊 Количество акций:</strong> <?php echo esc_html($stocks_count); ?></p>
                    </div>
                <?php else: ?>
                    <div class="notice notice-warning inline" style="margin: 15px 0;">
                        <p>⚠️ Данные ещё не загружены. Настройте подключение к Google Sheets.</p>
                    </div>
                <?php endif; ?>
                
                <form id="sheets-settings-form" style="margin-top: 20px;">
                    <table class="form-table">
                        <tr>
                            <th scope="row">
                                <label for="sheets_url">🔗 Ссылка на Google Sheets</label>
                            </th>
                            <td>
                                <input type="url" 
                                       id="sheets_url" 
                                       name="sheets_url" 
                                       value="<?php echo esc_attr($sheets_url); ?>"
                                       class="regular-text"
                                       placeholder="https://docs.google.com/spreadsheets/d/YOUR_SHEET_ID/edit"
                                       required>
                                <p class="description">
                                    Пример: <code>https://docs.google.com/spreadsheets/d/1ABC...XYZ/edit#gid=0</code><br>
                                    <strong style="color: #d63638;">Важно:</strong> Таблица должна быть <strong>опубликована</strong>!<br>
                                    <strong>Файл → Опубликовать в Интернете → Опубликовать</strong><br>
                                    (Простой "доступ по ссылке" не работает!)
                                </p>
                            </td>
                        </tr>
                    </table>
                    
                    <p class="submit">
                        <button type="button" class="button" id="test-connection-btn" style="margin-right: 10px;">
                            🔍 Проверить подключение
                        </button>
                        <button type="submit" class="button button-primary" id="save-url-btn">
                            💾 Сохранить и загрузить данные
                        </button>
                        <span id="action-spinner" class="spinner" style="float: none; margin-left: 10px;"></span>
                    </p>
                </form>
                
                <div id="action-result" style="margin-top: 20px;"></div>
            </div>
            
            <div class="card" style="max-width: 900px; margin-top: 20px;">
                <h2>📋 Требования к Google Sheets</h2>
                
                <h3>Обязательный лист: "цены"</h3>
                <table class="widefat" style="margin-top: 10px;">
                    <thead>
                        <tr>
                            <th>Time</th>
                            <th>SBER</th>
                            <th>GAZP</th>
                            <th>LKOH</th>
                            <th>...</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td>2023-01-01</td>
                            <td>250.5</td>
                            <td>180.2</td>
                            <td>5600</td>
                            <td>...</td>
                        </tr>
                        <tr>
                            <td>2023-02-01</td>
                            <td>255.0</td>
                            <td>182.5</td>
                            <td>5650</td>
                            <td>...</td>
                        </tr>
                    </tbody>
                </table>
                
                <h3 style="margin-top: 20px;">Опциональный лист: "дивиденды" или "Дивид"</h3>
                <table class="widefat" style="margin-top: 10px;">
                    <thead>
                        <tr>
                            <th>Time</th>
                            <th>SBER</th>
                            <th>GAZP</th>
                            <th>LKOH</th>
                            <th>...</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td>2023-01-01</td>
                            <td>5.0</td>
                            <td>3.2</td>
                            <td>150</td>
                            <td>...</td>
                        </tr>
                        <tr>
                            <td>2023-02-01</td>
                            <td>0</td>
                            <td>0</td>
                            <td>0</td>
                            <td>...</td>
                        </tr>
                    </tbody>
                </table>
                
                <div style="margin-top: 20px; padding: 15px; background: #f0f8ff; border-left: 4px solid #0073aa;">
                    <strong>💡 Совет:</strong> Первая колонка должна быть "Time" с датами в формате YYYY-MM-DD
                </div>
            </div>
            
            <?php if ($market_data && isset($market_data['stocks'])): ?>
                <div class="card" style="max-width: 900px; margin-top: 20px;">
                    <h2>👀 Превью данных</h2>
                    <div style="max-height: 400px; overflow-y: auto;">
                        <table class="widefat striped">
                            <thead>
                                <tr>
                                    <th>Тикер</th>
                                    <th>Периодов</th>
                                    <th>Первая дата</th>
                                    <th>Последняя дата</th>
                                    <th>Первая цена</th>
                                    <th>Последняя цена</th>
                                </tr>
                            </thead>
                            <tbody>
                                <?php foreach (array_slice($market_data['stocks'], 0, 20) as $stock): ?>
                                    <tr>
                                        <td><strong><?php echo esc_html($stock['ticker']); ?></strong></td>
                                        <td><?php echo esc_html(count($stock['prices'])); ?></td>
                                        <td><?php echo esc_html($stock['dates'][0] ?? '-'); ?></td>
                                        <td><?php echo esc_html(end($stock['dates']) ?: '-'); ?></td>
                                        <td><?php echo esc_html(number_format($stock['prices'][0] ?? 0, 2)); ?></td>
                                        <td><?php echo esc_html(number_format(end($stock['prices']) ?: 0, 2)); ?></td>
                                    </tr>
                                <?php endforeach; ?>
                            </tbody>
                        </table>
                        <?php if (count($market_data['stocks']) > 20): ?>
                            <p style="margin-top: 10px; color: #666;">
                                Показано 20 из <?php echo count($market_data['stocks']); ?> акций
                            </p>
                        <?php endif; ?>
                    </div>
                </div>
            <?php endif; ?>
        </div>
        <?php
    }
    
    /**
     * Подключение скриптов для админки
     */
    public function enqueue_admin_scripts($hook) {
        if ($hook !== 'toplevel_page_momentum-optimizer') {
            return;
        }
        
        wp_enqueue_script(
            'momentum-optimizer-admin',
            $this->plugin_url . 'assets/js/admin-sheets.js',
            array('jquery'),
            '1.2.0',
            true
        );
        
        wp_localize_script('momentum-optimizer-admin', 'momentumOptimizerAdmin', array(
            'ajaxUrl' => admin_url('admin-ajax.php'),
            'nonce' => wp_create_nonce('momentum_optimizer_admin_nonce')
        ));
    }
    
    /**
     * Подключение скриптов и стилей для фронтенда
     */
    public function enqueue_scripts() {
        global $post;
        if (!is_a($post, 'WP_Post') || !has_shortcode($post->post_content, 'momentum_optimizer')) {
            return;
        }
        
        wp_enqueue_style(
            'tailwind-css',
            'https://cdn.jsdelivr.net/npm/tailwindcss@2.2.19/dist/tailwind.min.css',
            array(),
            '2.2.19'
        );
        
        wp_enqueue_style(
            'momentum-optimizer-styles',
            $this->plugin_url . 'assets/css/momentum-optimizer.css',
            array('tailwind-css'),
            '1.2.0'
        );
        
        wp_enqueue_script(
            'react',
            'https://unpkg.com/react@17/umd/react.production.min.js',
            array(),
            '17.0.0',
            true
        );
        
        wp_enqueue_script(
            'react-dom',
            'https://unpkg.com/react-dom@17/umd/react-dom.production.min.js',
            array('react'),
            '17.0.0',
            true
        );
        
        wp_enqueue_script(
            'momentum-optimizer-app',
            $this->plugin_url . 'assets/js/momentum-optimizer.js',
            array('react', 'react-dom'),
            '1.2.1',
            true
        );
        
        wp_localize_script('momentum-optimizer-app', 'momentumOptimizerData', array(
            'ajaxUrl' => admin_url('admin-ajax.php'),
            'nonce' => wp_create_nonce('momentum_optimizer_nonce'),
            'pluginUrl' => $this->plugin_url
        ));
    }
    
    /**
     * Рендер шорткода
     */
    public function render_shortcode($atts) {
        $atts = shortcode_atts(array(
            'container_class' => 'momentum-optimizer-container'
        ), $atts);
        
        ob_start();
        ?>
        <div id="momentum-optimizer-root" class="<?php echo esc_attr($atts['container_class']); ?>">
            <div style="text-align: center; padding: 40px;">
                <div class="spinner" style="border: 4px solid #f3f3f3; border-top: 4px solid #3498db; border-radius: 50%; width: 40px; height: 40px; animation: spin 1s linear infinite; margin: 0 auto;"></div>
                <p style="margin-top: 20px; color: #666;">Загрузка Momentum Optimizer...</p>
            </div>
        </div>
        <style>
            @keyframes spin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
            }
        </style>
        <?php
        return ob_get_clean();
    }
    
    /**
     * Извлечение Sheet ID из URL
     */
    private function extract_sheet_id($url) {
        // Пример URL: https://docs.google.com/spreadsheets/d/1ABC...XYZ/edit#gid=0
        if (preg_match('/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/', $url, $matches)) {
            return $matches[1];
        }
        return false;
    }
    
    /**
     * Получение данных из Google Sheets через публичный CSV экспорт
     */
    private function fetch_google_sheet($sheet_id, $gid = 0) {
        // Google Sheets позволяет экспортировать в CSV через публичную ссылку
        // Попробуем несколько вариантов URL
        
        $urls = array(
            // Вариант 1: Стандартный экспорт
            "https://docs.google.com/spreadsheets/d/{$sheet_id}/export?format=csv&gid={$gid}",
            // Вариант 2: С параметром output=csv
            "https://docs.google.com/spreadsheets/d/{$sheet_id}/gviz/tq?tqx=out:csv&gid={$gid}",
            // Вариант 3: Прямая ссылка на публикацию
            "https://docs.google.com/spreadsheets/d/{$sheet_id}/pub?output=csv&gid={$gid}"
        );
        
        $last_error = '';
        
        foreach ($urls as $csv_url) {
            $response = wp_remote_get($csv_url, array(
                'timeout' => 60, // Увеличиваем до 60 секунд для больших таблиц
                'sslverify' => false,
                'headers' => array(
                    'User-Agent' => 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    'Accept-Encoding' => 'gzip, deflate' // Запрашиваем сжатие
                ),
                'decompress' => true // Автоматически распаковываем
            ));
            
            if (is_wp_error($response)) {
                $last_error = $response->get_error_message();
                continue;
            }
            
            $status_code = wp_remote_retrieve_response_code($response);
            if ($status_code === 200) {
                $csv_data = wp_remote_retrieve_body($response);
                if (!empty($csv_data)) {
                    return $csv_data;
                }
            } else {
                $last_error = "HTTP {$status_code}";
            }
        }
        
        // Если все варианты не сработали
        throw new Exception(
            "Не удалось загрузить данные из Google Sheets.\n\n" .
            "Возможные причины:\n" .
            "1. Таблица не опубликована (см. инструкцию ниже)\n" .
            "2. Неверный Sheet ID\n" .
            "3. Лист с таким GID не существует\n\n" .
            "ВАЖНО: Недостаточно просто сделать 'Доступ по ссылке'!\n\n" .
            "Правильный способ:\n" .
            "1. Файл → Опубликовать в Интернете (не 'Настройки доступа'!)\n" .
            "2. Выберите лист: 'цены' или 'Весь документ'\n" .
            "3. Выберите формат: CSV\n" .
            "4. Нажмите 'Опубликовать'\n" .
            "5. Скопируйте обычную ссылку на таблицу (из адресной строки)\n\n" .
            "Последняя ошибка: {$last_error}"
        );
    }
    
    /**
     * Парсинг CSV данных
     */
    private function parse_csv($csv_data) {
        $lines = explode("\n", $csv_data);
        $result = array();
        
        foreach ($lines as $line) {
            if (empty(trim($line))) continue;
            $row = str_getcsv($line);
            $result[] = $row;
        }
        
        return $result;
    }
    
    /**
     * Конвертация CSV в структуру stocks
     */
    private function convert_csv_to_stocks($csv_array) {
        if (empty($csv_array)) {
            throw new Exception('CSV данные пусты');
        }
        
        $headers = array_shift($csv_array);
        
        if (empty($headers) || trim($headers[0]) !== 'Time') {
            throw new Exception('Первая колонка должна быть "Time"');
        }
        
        $tickers = array_slice($headers, 1);
        $tickers = array_map('trim', $tickers);
        $tickers = array_filter($tickers);
        
        if (empty($tickers)) {
            throw new Exception('Не найдено ни одного тикера');
        }
        
        $stocks = array();
        foreach ($tickers as $ticker) {
            $stocks[$ticker] = array(
                'ticker' => $ticker,
                'dates' => array(),
                'prices' => array()
            );
        }
        
        foreach ($csv_array as $row) {
            if (empty($row[0])) continue;
            
            $date = trim($row[0]);
            $timestamp = strtotime($date);
            if ($timestamp === false) continue;
            
            $formatted_date = date('Y-m-d', $timestamp);
            
            foreach ($tickers as $idx => $ticker) {
                $col_index = $idx + 1;
                
                if (!isset($row[$col_index])) continue;
                
                $price = trim($row[$col_index]);
                if ($price === '' || $price === null) continue;
                
                $price = str_replace(',', '.', $price);
                $price = floatval($price);
                
                if ($price > 0) {
                    $stocks[$ticker]['dates'][] = $formatted_date;
                    $stocks[$ticker]['prices'][] = $price;
                }
            }
        }
        
        return array_values($stocks);
    }
    
    /**
     * AJAX: Тестирование подключения
     */
    public function test_sheets_connection() {
        check_ajax_referer('momentum_optimizer_admin_nonce', 'nonce');
        
        if (!current_user_can('manage_options')) {
            wp_send_json_error('Недостаточно прав');
            return;
        }
        
        $sheets_url = isset($_POST['sheets_url']) ? sanitize_text_field($_POST['sheets_url']) : '';
        
        if (empty($sheets_url)) {
            wp_send_json_error('URL не указан');
            return;
        }
        
        try {
            $sheet_id = $this->extract_sheet_id($sheets_url);
            if (!$sheet_id) {
                throw new Exception('Неверный формат URL. Используйте ссылку вида: https://docs.google.com/spreadsheets/d/YOUR_ID/edit');
            }
            
            // Пробуем загрузить первый лист
            $csv_data = $this->fetch_google_sheet($sheet_id, 0);
            $csv_array = $this->parse_csv($csv_data);
            
            if (count($csv_array) < 2) {
                throw new Exception('Таблица слишком маленькая');
            }
            
            wp_send_json_success(array(
                'message' => 'Подключение успешно!',
                'sheet_id' => $sheet_id,
                'rows' => count($csv_array),
                'columns' => count($csv_array[0])
            ));
            
        } catch (Exception $e) {
            wp_send_json_error($e->getMessage());
        }
    }
    
    /**
     * AJAX: Сохранение URL и загрузка данных
     */
    public function save_sheets_url() {
        check_ajax_referer('momentum_optimizer_admin_nonce', 'nonce');
        
        if (!current_user_can('manage_options')) {
            wp_send_json_error('Недостаточно прав');
            return;
        }
        
        $sheets_url = isset($_POST['sheets_url']) ? sanitize_text_field($_POST['sheets_url']) : '';
        
        if (empty($sheets_url)) {
            wp_send_json_error('URL не указан');
            return;
        }
        
        try {
            // Увеличиваем лимиты для больших таблиц
            @ini_set('memory_limit', '256M');
            @set_time_limit(120);
            
            $sheet_id = $this->extract_sheet_id($sheets_url);
            if (!$sheet_id) {
                throw new Exception('Неверный формат URL');
            }
            
            // Загружаем лист "цены" (gid=0 - первый лист)
            $prices_csv = $this->fetch_google_sheet($sheet_id, 0);
            
            if (strlen($prices_csv) < 100) {
                throw new Exception('Слишком мало данных в первом листе. Убедитесь что лист "цены" идёт первым!');
            }
            
            $prices_array = $this->parse_csv($prices_csv);
            
            if (count($prices_array) < 2) {
                throw new Exception('В первом листе менее 2 строк. Проверьте структуру таблицы.');
            }
            
            $stocks = $this->convert_csv_to_stocks($prices_array);
            
            if (empty($stocks)) {
                throw new Exception('Не удалось извлечь данные об акциях. Проверьте формат таблицы.');
            }
            
            // Пробуем загрузить дивиденды (gid=1 - второй лист)
            $dividends = null;
            try {
                $div_csv = $this->fetch_google_sheet($sheet_id, 1);
                if (!empty($div_csv) && strlen($div_csv) > 100) {
                    $dividends = $this->parse_csv($div_csv);
                }
            } catch (Exception $e) {
                // Дивиденды опциональны, игнорируем ошибку
            }
            
            // Сохраняем данные
            $market_data = array(
                'updated_at' => current_time('Y-m-d H:i:s'),
                'stocks' => $stocks,
                'dividends' => $dividends,
                'sheet_id' => $sheet_id
            );
            
            update_option('momentum_optimizer_market_data', $market_data);
            update_option('momentum_optimizer_sheets_url', $sheets_url);
            update_option('momentum_optimizer_last_update', current_time('Y-m-d H:i:s'));
            
            wp_send_json_success(array(
                'message' => 'Данные успешно загружены из Google Sheets!',
                'stocks_count' => count($stocks),
                'has_dividends' => !empty($dividends),
                'updated_at' => current_time('Y-m-d H:i:s'),
                'total_prices' => array_sum(array_map(function($s) { return count($s['prices']); }, $stocks))
            ));
            
        } catch (Exception $e) {
            wp_send_json_error('Ошибка: ' . $e->getMessage());
        }
    }
    
    /**
     * AJAX: Получение данных рынка
     */
    public function get_market_data() {
        $market_data = get_option('momentum_optimizer_market_data', null);
        
        if (!$market_data) {
            wp_send_json_error('Данные не загружены. Администратор должен настроить Google Sheets.');
            return;
        }
        
        wp_send_json_success($market_data);
    }
}

// Инициализация плагина
function momentum_optimizer_init() {
    new MomentumOptimizerPlugin();
}
add_action('plugins_loaded', 'momentum_optimizer_init');

register_activation_hook(__FILE__, function() {
    add_option('momentum_optimizer_version', '1.2.0');
});

register_deactivation_hook(__FILE__, function() {
    // Очистка при необходимости
});