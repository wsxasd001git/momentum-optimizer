<?php
/**
 * Shortcode template for Momentum Screener
 */

if (!defined('ABSPATH')) {
    exit;
}
?>

<div id="momentum-screener-app" class="momentum-screener-container"
     data-lookback="<?php echo esc_attr($atts['lookback']); ?>"
     data-holding="<?php echo esc_attr($atts['holding']); ?>"
     data-topn="<?php echo esc_attr($atts['topn']); ?>">

    <!-- Header -->
    <div class="ms-header">
        <h2 class="ms-title"><?php esc_html_e('Оптимизатор Momentum Стратегии', 'momentum-screener'); ?></h2>
        <p class="ms-subtitle"><?php esc_html_e('Российский рынок акций', 'momentum-screener'); ?></p>
        <div class="ms-stats" id="ms-stats"></div>
    </div>

    <!-- Loading indicator -->
    <div class="ms-loading" id="ms-loading">
        <div class="ms-spinner"></div>
        <p><?php esc_html_e('Загрузка данных...', 'momentum-screener'); ?></p>
    </div>

    <!-- Error message -->
    <div class="ms-error" id="ms-error" style="display: none;">
        <p></p>
    </div>

    <!-- Main content -->
    <div class="ms-content" id="ms-content" style="display: none;">

        <!-- Controls -->
        <div class="ms-controls">
            <div class="ms-control-group">
                <label for="ms-lookback"><?php esc_html_e('Период расчета momentum (мес)', 'momentum-screener'); ?></label>
                <input type="range" id="ms-lookback" min="1" max="12" value="<?php echo esc_attr($atts['lookback']); ?>">
                <span class="ms-control-value" id="ms-lookback-value"><?php echo esc_html($atts['lookback']); ?> мес</span>
                <p class="ms-control-desc"><?php esc_html_e('За какой период считаем доходность для ранжирования акций', 'momentum-screener'); ?></p>
            </div>

            <div class="ms-control-group">
                <label for="ms-holding"><?php esc_html_e('Период удержания (мес)', 'momentum-screener'); ?></label>
                <input type="range" id="ms-holding" min="1" max="6" value="<?php echo esc_attr($atts['holding']); ?>">
                <span class="ms-control-value" id="ms-holding-value"><?php echo esc_html($atts['holding']); ?> мес</span>
                <p class="ms-control-desc"><?php esc_html_e('Как долго держим позиции перед ребалансировкой', 'momentum-screener'); ?></p>
            </div>

            <div class="ms-control-group">
                <label for="ms-topn"><?php esc_html_e('Количество акций в портфеле', 'momentum-screener'); ?></label>
                <input type="range" id="ms-topn" min="5" max="30" value="<?php echo esc_attr($atts['topn']); ?>">
                <span class="ms-control-value" id="ms-topn-value"><?php echo esc_html($atts['topn']); ?> акций</span>
                <p class="ms-control-desc"><?php esc_html_e('Топ N акций с наибольшим momentum', 'momentum-screener'); ?></p>
            </div>
        </div>

        <!-- Options -->
        <div class="ms-options">
            <div class="ms-option-row">
                <div class="ms-option">
                    <div class="ms-option-header">
                        <div>
                            <h4><?php esc_html_e('Учет дивидендов', 'momentum-screener'); ?></h4>
                            <p id="ms-dividends-desc"><?php esc_html_e('Полная доходность: рост цены + дивиденды', 'momentum-screener'); ?></p>
                        </div>
                        <button class="ms-toggle active" id="ms-dividends-toggle" data-enabled="true">
                            <?php esc_html_e('Включено', 'momentum-screener'); ?>
                        </button>
                    </div>
                </div>

                <div class="ms-option">
                    <div class="ms-option-header">
                        <div>
                            <h4><?php esc_html_e('Фильтр последнего месяца (Reversal Effect)', 'momentum-screener'); ?></h4>
                            <p id="ms-skip-desc"><?php esc_html_e('Исключаем последний месяц из расчета momentum', 'momentum-screener'); ?></p>
                        </div>
                        <button class="ms-toggle active" id="ms-skip-toggle" data-enabled="true">
                            <?php esc_html_e('Включено', 'momentum-screener'); ?>
                        </button>
                    </div>
                </div>
            </div>

            <div class="ms-option-row">
                <div class="ms-option ms-option-advanced">
                    <div class="ms-option-header">
                        <h4><?php esc_html_e('Фильтр волатильности', 'momentum-screener'); ?></h4>
                        <button class="ms-toggle" id="ms-volfilter-toggle" data-enabled="false">
                            <?php esc_html_e('ВЫКЛ', 'momentum-screener'); ?>
                        </button>
                    </div>
                    <div class="ms-option-body" id="ms-volfilter-body" style="display: none;">
                        <label><?php esc_html_e('Макс. волатильность:', 'momentum-screener'); ?> <span id="ms-maxvol-value">50</span>%</label>
                        <input type="range" id="ms-maxvol" min="20" max="100" step="5" value="50">
                        <p><?php esc_html_e('Исключает акции с волатильностью выше порога', 'momentum-screener'); ?></p>
                    </div>
                    <div class="ms-option-sub">
                        <span><?php esc_html_e('Риск-корректированный momentum', 'momentum-screener'); ?></span>
                        <button class="ms-toggle-small" id="ms-riskadj-toggle" data-enabled="false">
                            <?php esc_html_e('ВЫКЛ', 'momentum-screener'); ?>
                        </button>
                    </div>
                </div>

                <div class="ms-option ms-option-advanced">
                    <div class="ms-option-header">
                        <h4><?php esc_html_e('Динамический режим', 'momentum-screener'); ?></h4>
                        <button class="ms-toggle" id="ms-dynamic-toggle" data-enabled="false">
                            <?php esc_html_e('ВЫКЛ', 'momentum-screener'); ?>
                        </button>
                    </div>
                    <div class="ms-option-body" id="ms-dynamic-body" style="display: none;">
                        <label><?php esc_html_e('Порог рыночной волатильности:', 'momentum-screener'); ?> <span id="ms-marketvol-value">25</span>%</label>
                        <input type="range" id="ms-marketvol" min="15" max="50" step="5" value="25">
                        <p><?php esc_html_e('При высокой волатильности увеличиваем диверсификацию', 'momentum-screener'); ?></p>
                    </div>
                </div>
            </div>
        </div>

        <!-- Metrics -->
        <div class="ms-metrics" id="ms-metrics">
            <div class="ms-metric ms-metric-primary">
                <span class="ms-metric-label"><?php esc_html_e('Общая доходность', 'momentum-screener'); ?></span>
                <span class="ms-metric-value" id="ms-total-return">-</span>
            </div>
            <div class="ms-metric ms-metric-primary">
                <span class="ms-metric-label"><?php esc_html_e('Годовая доходность', 'momentum-screener'); ?></span>
                <span class="ms-metric-value" id="ms-annual-return">-</span>
            </div>
            <div class="ms-metric ms-metric-primary">
                <span class="ms-metric-label"><?php esc_html_e('Коэф. Шарпа', 'momentum-screener'); ?></span>
                <span class="ms-metric-value" id="ms-sharpe">-</span>
            </div>
            <div class="ms-metric ms-metric-primary">
                <span class="ms-metric-label"><?php esc_html_e('Коэф. Сортино', 'momentum-screener'); ?></span>
                <span class="ms-metric-value" id="ms-sortino">-</span>
            </div>
            <div class="ms-metric ms-metric-primary">
                <span class="ms-metric-label"><?php esc_html_e('Макс. просадка', 'momentum-screener'); ?></span>
                <span class="ms-metric-value" id="ms-drawdown">-</span>
            </div>
        </div>

        <div class="ms-metrics-secondary">
            <div class="ms-metric">
                <span class="ms-metric-label"><?php esc_html_e('Средняя доходность периода', 'momentum-screener'); ?></span>
                <span class="ms-metric-value" id="ms-avg-return">-</span>
            </div>
            <div class="ms-metric">
                <span class="ms-metric-label"><?php esc_html_e('Волатильность', 'momentum-screener'); ?></span>
                <span class="ms-metric-value" id="ms-volatility">-</span>
            </div>
            <div class="ms-metric">
                <span class="ms-metric-label"><?php esc_html_e('Количество сделок', 'momentum-screener'); ?></span>
                <span class="ms-metric-value" id="ms-trades">-</span>
            </div>
        </div>

        <!-- Charts -->
        <div class="ms-charts" id="ms-charts">
            <div class="ms-chart-container">
                <h3><?php esc_html_e('Кривая капитала', 'momentum-screener'); ?></h3>
                <canvas id="ms-equity-chart"></canvas>
            </div>
            <div class="ms-chart-container">
                <h3><?php esc_html_e('Распределение доходности периодов', 'momentum-screener'); ?></h3>
                <canvas id="ms-returns-chart"></canvas>
            </div>
        </div>

        <!-- Current Recommendations -->
        <div class="ms-recommendations" id="ms-recommendations">
            <div class="ms-recommendations-header">
                <div>
                    <h3><?php esc_html_e('Текущие рекомендации', 'momentum-screener'); ?></h3>
                    <p id="ms-recommendations-date"></p>
                </div>
                <div class="ms-recommendations-info">
                    <div>
                        <span class="ms-label"><?php esc_html_e('Размер портфеля', 'momentum-screener'); ?></span>
                        <span class="ms-value" id="ms-portfolio-size">-</span>
                    </div>
                    <div>
                        <span class="ms-label"><?php esc_html_e('Рыночная волатильность', 'momentum-screener'); ?></span>
                        <span class="ms-value" id="ms-market-vol">-</span>
                    </div>
                </div>
            </div>
            <div class="ms-stocks-grid" id="ms-stocks-grid"></div>
            <div class="ms-recommendations-tip">
                <p><?php esc_html_e('Совет: Распределите капитал равными долями между всеми акциями.', 'momentum-screener'); ?></p>
            </div>
        </div>

        <!-- Trade History -->
        <div class="ms-history" id="ms-history">
            <h3><?php esc_html_e('История сделок', 'momentum-screener'); ?></h3>
            <p class="ms-history-desc"><?php esc_html_e('Кликните на период, чтобы увидеть детали по каждой акции', 'momentum-screener'); ?></p>
            <table class="ms-history-table">
                <thead>
                    <tr>
                        <th><?php esc_html_e('Дата покупки', 'momentum-screener'); ?></th>
                        <th><?php esc_html_e('Дата продажи', 'momentum-screener'); ?></th>
                        <th><?php esc_html_e('Акций', 'momentum-screener'); ?></th>
                        <th><?php esc_html_e('Доходность', 'momentum-screener'); ?></th>
                        <th><?php esc_html_e('Детали', 'momentum-screener'); ?></th>
                    </tr>
                </thead>
                <tbody id="ms-history-body"></tbody>
            </table>
        </div>

        <!-- Tips -->
        <div class="ms-tips" id="ms-tips">
            <h3><?php esc_html_e('Рекомендации', 'momentum-screener'); ?></h3>
            <div id="ms-tips-content"></div>
        </div>
    </div>
</div>
