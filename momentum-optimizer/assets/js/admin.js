// Admin script для загрузки данных
(function($) {
    'use strict';
    
    $(document).ready(function() {
        const form = $('#momentum-upload-form');
        const uploadBtn = $('#upload-btn');
        const spinner = $('#upload-spinner');
        const resultDiv = $('#upload-result');
        
        form.on('submit', function(e) {
            e.preventDefault();
            
            const fileInput = $('#excel_file')[0];
            if (!fileInput.files.length) {
                showResult('error', 'Выберите файл');
                return;
            }
            
            const formData = new FormData();
            formData.append('action', 'upload_momentum_excel');
            formData.append('nonce', momentumOptimizerAdmin.nonce);
            formData.append('excel_file', fileInput.files[0]);
            
            // Показываем загрузку
            uploadBtn.prop('disabled', true);
            spinner.addClass('is-active');
            resultDiv.html('');
            
            $.ajax({
                url: momentumOptimizerAdmin.ajaxUrl,
                type: 'POST',
                data: formData,
                processData: false,
                contentType: false,
                success: function(response) {
                    uploadBtn.prop('disabled', false);
                    spinner.removeClass('is-active');
                    
                    if (response.success) {
                        showResult('success', response.data.message + 
                            '<br>Акций загружено: ' + response.data.stocks_count +
                            '<br>Время обновления: ' + response.data.updated_at);
                        
                        // Перезагружаем страницу через 2 секунды
                        setTimeout(function() {
                            location.reload();
                        }, 2000);
                    } else {
                        showResult('error', response.data || 'Ошибка загрузки');
                    }
                },
                error: function(xhr, status, error) {
                    uploadBtn.prop('disabled', false);
                    spinner.removeClass('is-active');
                    showResult('error', 'Ошибка сервера: ' + error);
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
