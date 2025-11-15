// Admin script для Google Sheets подключения
(function($) {
    'use strict';
    
    $(document).ready(function() {
        const form = $('#sheets-settings-form');
        const testBtn = $('#test-connection-btn');
        const saveBtn = $('#save-url-btn');
        const spinner = $('#action-spinner');
        const resultDiv = $('#action-result');
        const sheetsUrlInput = $('#sheets_url');
        
        // Тест подключения
        testBtn.on('click', function(e) {
            e.preventDefault();
            
            const sheetsUrl = sheetsUrlInput.val().trim();
            
            if (!sheetsUrl) {
                showResult('error', 'Введите ссылку на Google Sheets');
                return;
            }
            
            testBtn.prop('disabled', true);
            spinner.addClass('is-active');
            resultDiv.html('');
            
            $.ajax({
                url: momentumOptimizerAdmin.ajaxUrl,
                type: 'POST',
                data: {
                    action: 'test_sheets_connection',
                    nonce: momentumOptimizerAdmin.nonce,
                    sheets_url: sheetsUrl
                },
                success: function(response) {
                    testBtn.prop('disabled', false);
                    spinner.removeClass('is-active');
                    
                    if (response.success) {
                        showResult('success', 
                            '✅ ' + response.data.message + 
                            '<br>📊 Sheet ID: ' + response.data.sheet_id +
                            '<br>📏 Строк: ' + response.data.rows + 
                            ', Колонок: ' + response.data.columns
                        );
                    } else {
                        showResult('error', '❌ ' + (response.data || 'Ошибка подключения'));
                    }
                },
                error: function(xhr, status, error) {
                    testBtn.prop('disabled', false);
                    spinner.removeClass('is-active');
                    showResult('error', '❌ Ошибка сервера: ' + error);
                }
            });
        });
        
        // Сохранение и загрузка данных
        form.on('submit', function(e) {
            e.preventDefault();
            
            const sheetsUrl = sheetsUrlInput.val().trim();
            
            if (!sheetsUrl) {
                showResult('error', 'Введите ссылку на Google Sheets');
                return;
            }
            
            saveBtn.prop('disabled', true);
            testBtn.prop('disabled', true);
            spinner.addClass('is-active');
            resultDiv.html('');
            
            $.ajax({
                url: momentumOptimizerAdmin.ajaxUrl,
                type: 'POST',
                data: {
                    action: 'save_sheets_url',
                    nonce: momentumOptimizerAdmin.nonce,
                    sheets_url: sheetsUrl
                },
                success: function(response) {
                    saveBtn.prop('disabled', false);
                    testBtn.prop('disabled', false);
                    spinner.removeClass('is-active');
                    
                    if (response.success) {
                        showResult('success', 
                            '🎉 ' + response.data.message +
                            '<br>📊 Акций загружено: ' + response.data.stocks_count +
                            '<br>💰 Дивиденды: ' + (response.data.has_dividends ? '✅ Да' : '❌ Нет') +
                            '<br>🕐 Время обновления: ' + response.data.updated_at
                        );
                        
                        // Перезагружаем страницу через 2 секунды
                        setTimeout(function() {
                            location.reload();
                        }, 2000);
                    } else {
                        showResult('error', '❌ ' + (response.data || 'Ошибка загрузки данных'));
                    }
                },
                error: function(xhr, status, error) {
                    saveBtn.prop('disabled', false);
                    testBtn.prop('disabled', false);
                    spinner.removeClass('is-active');
                    showResult('error', '❌ Ошибка сервера: ' + error);
                }
            });
        });
        
        function showResult(type, message) {
            const className = type === 'success' ? 'notice-success' : 'notice-error';
            resultDiv.html(
                '<div class="notice ' + className + ' inline"><p>' + message + '</p></div>'
            );
        }
    });
    
})(jQuery);
