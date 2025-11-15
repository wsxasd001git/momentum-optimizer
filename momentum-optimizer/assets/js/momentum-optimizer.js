// Полная версия Momentum Optimizer v1.1.0
// Изменения:
// - Добавлен фильтр выхода в кеш при низком/отрицательном моментуме
// - Минимальный период расчета momentum = 2 месяца
// - Автозагрузка данных с сервера (админка)
// - Доходность кеша 8% годовых
(function() {
    'use strict';
    
    const { useState, useEffect, useMemo, createElement: h } = React;
    
    const MomentumOptimizer = () => {
        const [data, setData] = useState(null);
        const [dividendData, setDividendData] = useState(null);
        const [loading, setLoading] = useState(true);
        const [error, setError] = useState(null);
        const [dataUpdatedAt, setDataUpdatedAt] = useState(null);
        const [lookbackPeriod, setLookbackPeriod] = useState(3);
        const [holdingPeriod, setHoldingPeriod] = useState(1);
        const [topN, setTopN] = useState(10);
        const [minMomentum, setMinMomentum] = useState(0); // НОВЫЙ: минимальный моментум для входа
        const [useDividends, setUseDividends] = useState(true);
        const [skipLastMonth, setSkipLastMonth] = useState(true);
        const [useVolFilter, setUseVolFilter] = useState(false);
        const [maxVol, setMaxVol] = useState(50);
        const [useRiskAdj, setUseRiskAdj] = useState(false);
        const [dynamicMode, setDynamicMode] = useState(false);
        const [marketVolThreshold, setMarketVolThreshold] = useState(25);
        const [selectedPeriod, setSelectedPeriod] = useState(null);

        // Автозагрузка данных при монтировании компонента
        useEffect(() => {
            loadMarketData();
        }, []);

        const loadMarketData = () => {
            setLoading(true);
            setError(null);
            
            fetch(momentumOptimizerData.ajaxUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: new URLSearchParams({
                    action: 'get_market_data'
                })
            })
            .then(response => response.json())
            .then(result => {
                if (result.success) {
                    const marketData = result.data;
                    const convertedData = convertServerDataToLocalFormat(marketData.stocks);
                    setData(convertedData);
                    setDataUpdatedAt(marketData.updated_at);
                    if (marketData.dividends) {
                        setDividendData(marketData.dividends);
                    }
                    setLoading(false);
                } else {
                    setError('Данные не загружены администратором.');
                    setLoading(false);
                }
            })
            .catch(err => {
                setError('Ошибка загрузки: ' + err.message);
                setLoading(false);
            });
        };

        const convertServerDataToLocalFormat = (stocks) => {
            if (!stocks || stocks.length === 0) return [];
            const dateMap = {};
            stocks.forEach(stock => {
                stock.dates.forEach((date, idx) => {
                    if (!dateMap[date]) {
                        dateMap[date] = { Time: date };
                    }
                    dateMap[date][stock.ticker] = stock.prices[idx];
                });
            });
            return Object.keys(dateMap).sort().map(date => dateMap[date]);
        };

        const stats = useMemo(() => {
            if (!data || data.length === 0) return null;
            
            const allTickersSet = new Set();
            data.forEach(row => {
                Object.keys(row).forEach(key => {
                    if (key !== 'Time') allTickersSet.add(key);
                });
            });
            
            const lastRow = data[data.length - 1];
            const activeCount = Object.keys(lastRow).filter(k => k !== 'Time' && lastRow[k] != null && lastRow[k] !== '').length;
            
            return {
                totalTickers: allTickersSet.size,
                activeTickers: activeCount,
                periods: data.length
            };
        }, [data]);

        const result = useMemo(() => {
            if (!data || data.length === 0) return null;

            const allTickersArray = Object.keys(data[0]).filter(k => k !== 'Time');
            const results = [];
            const portfolioValues = [];
            const detailedTrades = [];
            let cash = 100000;

            const calcVol = (prices) => {
                if (prices.length < 2) return 0;
                const returns = [];
                for (let i = 1; i < prices.length; i++) {
                    if (prices[i] && prices[i-1] && prices[i-1] > 0) {
                        returns.push((prices[i] - prices[i-1]) / prices[i-1]);
                    }
                }
                if (returns.length === 0) return 0;
                const avg = returns.reduce((a, b) => a + b, 0) / returns.length;
                const variance = returns.reduce((sum, r) => sum + Math.pow(r - avg, 2), 0) / returns.length;
                return Math.sqrt(variance) * 100;
            };

            const calcMarketVol = (endIdx) => {
                const startIdx = Math.max(0, endIdx - lookbackPeriod);
                const returns = [];
                
                for (let i = startIdx + 1; i <= endIdx && i < data.length; i++) {
                    let avgReturn = 0;
                    let count = 0;
                    allTickersArray.forEach(ticker => {
                        if (data[i][ticker] && data[i-1][ticker] && data[i-1][ticker] > 0) {
                            avgReturn += (data[i][ticker] - data[i-1][ticker]) / data[i-1][ticker];
                            count++;
                        }
                    });
                    if (count > 0) returns.push(avgReturn / count);
                }
                
                if (returns.length === 0) return 0;
                const avg = returns.reduce((a, b) => a + b, 0) / returns.length;
                const variance = returns.reduce((sum, r) => sum + Math.pow(r - avg, 2), 0) / returns.length;
                return Math.sqrt(variance) * 100;
            };

            const calcMomentumAtIndex = (i) => {
                const currentDate = new Date(data[i].Time);
                const momentumScores = [];
                
                let adjustedTopN = topN;
                if (dynamicMode) {
                    const marketVol = calcMarketVol(i);
                    if (marketVol > marketVolThreshold) {
                        adjustedTopN = Math.min(Math.round(topN * 1.5), 30);
                    } else {
                        adjustedTopN = Math.max(Math.round(topN * 0.7), 5);
                    }
                }

                allTickersArray.forEach(ticker => {
                    const currentPrice = data[i][ticker];
                    let pastPrice, dividendStartIdx, dividendEndIdx;
                    
                    if (skipLastMonth) {
                        if (i - lookbackPeriod - 1 < 0) return;
                        pastPrice = data[i - lookbackPeriod - 1][ticker];
                        dividendStartIdx = i - lookbackPeriod;
                        dividendEndIdx = i - 1;
                    } else {
                        pastPrice = data[i - lookbackPeriod][ticker];
                        dividendStartIdx = i - lookbackPeriod + 1;
                        dividendEndIdx = i;
                    }

                    if (currentPrice && pastPrice && currentPrice > 0 && pastPrice > 0) {
                        const prices = [];
                        const volStartIdx = skipLastMonth ? i - lookbackPeriod - 1 : i - lookbackPeriod;
                        for (let j = Math.max(0, volStartIdx); j <= i; j++) {
                            if (data[j][ticker]) prices.push(data[j][ticker]);
                        }
                        const vol = calcVol(prices);
                        
                        if (useVolFilter && vol > maxVol) return;

                        let priceReturn = (currentPrice - pastPrice) / pastPrice;
                        let totalReturn = priceReturn;
                        
                        if (useDividends && dividendData) {
                            let dividendReturn = 0;
                            for (let j = dividendStartIdx; j <= dividendEndIdx; j++) {
                                if (j >= 0 && j < dividendData.length) {
                                    const divRow = dividendData[j];
                                    const priceForYield = data[j][ticker];
                                    if (divRow && divRow[ticker] && priceForYield && priceForYield > 0) {
                                        dividendReturn += divRow[ticker] / priceForYield;
                                    }
                                }
                            }
                            totalReturn = priceReturn + dividendReturn;
                        }
                        
                        let momentum = totalReturn;
                        if (useRiskAdj && vol > 0) {
                            momentum = (totalReturn * 100) / vol;
                        }
                        
                        momentumScores.push({ 
                            ticker, 
                            momentum, 
                            price: currentPrice,
                            volatility: vol,
                            rawReturn: totalReturn
                        });
                    }
                });

                momentumScores.sort((a, b) => b.momentum - a.momentum);
                return {
                    selectedStocks: momentumScores.slice(0, adjustedTopN),
                    adjustedTopN,
                    date: currentDate
                };
            };

            const startIdx = skipLastMonth ? lookbackPeriod + 1 : lookbackPeriod;
            
            for (let i = startIdx; i < data.length - holdingPeriod; i += holdingPeriod) {
                const { selectedStocks, adjustedTopN } = calcMomentumAtIndex(i);
                const currentDate = new Date(data[i].Time);

                if (selectedStocks.length > 0) {
                    let periodReturn = 0;
                    const stockDetails = [];

                    selectedStocks.forEach(stock => {
                        const buyPrice = stock.price;
                        const sellPrice = data[i + holdingPeriod][stock.ticker];

                        if (sellPrice && sellPrice > 0) {
                            let priceReturn = (sellPrice - buyPrice) / buyPrice;
                            let stockReturn = priceReturn;
                            
                            if (useDividends && dividendData) {
                                let dividendReturn = 0;
                                for (let j = i + 1; j <= i + holdingPeriod && j < data.length; j++) {
                                    if (j < dividendData.length) {
                                        const divRow = dividendData[j];
                                        const priceForYield = data[j][stock.ticker];
                                        if (divRow && divRow[stock.ticker] && priceForYield && priceForYield > 0) {
                                            dividendReturn += divRow[stock.ticker] / priceForYield;
                                        }
                                    }
                                }
                                stockReturn = priceReturn + dividendReturn;
                            }
                            
                            periodReturn += stockReturn / selectedStocks.length;
                            
                            stockDetails.push({
                                ticker: stock.ticker,
                                momentum: stock.momentum,
                                buyPrice: buyPrice.toFixed(2),
                                sellPrice: sellPrice.toFixed(2),
                                return: (stockReturn * 100).toFixed(2),
                                weight: (100 / selectedStocks.length).toFixed(1)
                            });
                        }
                    });

                    cash *= (1 + periodReturn);
                    portfolioValues.push({
                        date: currentDate.toISOString().split('T')[0],
                        value: cash,
                        return: periodReturn * 100
                    });

                    detailedTrades.push({
                        date: currentDate.toISOString().split('T')[0],
                        sellDate: new Date(data[i + holdingPeriod].Time).toISOString().split('T')[0],
                        totalReturn: (periodReturn * 100).toFixed(2),
                        stockCount: selectedStocks.length,
                        stocks: stockDetails
                    });

                    results.push({
                        date: currentDate.toISOString().split('T')[0],
                        stocks: selectedStocks.map(s => s.ticker).join(', '),
                        return: periodReturn * 100
                    });
                }
            }

            if (portfolioValues.length === 0) return null;

            const lastIdx = data.length - 1;
            let currentRecommendations = null;
            if (lastIdx >= startIdx) {
                const { selectedStocks, adjustedTopN, date } = calcMomentumAtIndex(lastIdx);
                const marketVol = calcMarketVol(lastIdx);
                
                // НОВАЯ ЛОГИКА: Фильтр по минимальному моментуму
                const minMomentumDecimal = minMomentum / 100; // Конвертируем из процентов
                const activeStocks = [];
                let cashPosition = 0;
                
                selectedStocks.forEach(s => {
                    // Проверяем моментум (в зависимости от useRiskAdj, может быть риск-скор)
                    const momentumValue = useRiskAdj ? s.momentum : s.rawReturn;
                    
                    if (momentumValue >= minMomentumDecimal) {
                        activeStocks.push(s);
                    } else {
                        cashPosition += 1 / adjustedTopN; // Одна доля уходит в кеш
                    }
                });
                
                const activeWeight = activeStocks.length > 0 ? (100 / adjustedTopN) : 0;
                
                currentRecommendations = {
                    date: date.toISOString().split('T')[0],
                    stocks: activeStocks.map(s => ({
                        ticker: s.ticker,
                        price: s.price.toFixed(2),
                        momentum: useRiskAdj ? s.momentum.toFixed(2) : (s.momentum * 100).toFixed(2),
                        rawReturn: (s.rawReturn * 100).toFixed(2),
                        volatility: s.volatility.toFixed(2),
                        weight: activeWeight.toFixed(1)
                    })),
                    cashPosition: (cashPosition * 100).toFixed(1), // Процент в кеше
                    cashWeight: activeWeight.toFixed(1), // Вес одной доли
                    portfolioSize: adjustedTopN,
                    marketVolatility: marketVol.toFixed(2),
                    filteredStocks: selectedStocks.length - activeStocks.length // Сколько отфильтровано
                };
            }

            const totalReturn = ((cash - 100000) / 100000) * 100;
            
            const firstDate = new Date(portfolioValues[0].date);
            const lastDate = new Date(portfolioValues[portfolioValues.length - 1].date);
            const totalYears = (lastDate - firstDate) / (1000 * 60 * 60 * 24 * 365.25);
            const annualReturn = ((Math.pow(cash / 100000, 1 / totalYears) - 1) * 100);
            
            const periods = portfolioValues.length;
            const avgReturn = portfolioValues.reduce((sum, v) => sum + v.return, 0) / periods;
            const volatility = Math.sqrt(
                portfolioValues.reduce((sum, v) => sum + Math.pow(v.return - avgReturn, 2), 0) / periods
            );
            const sharpeRatio = volatility > 0 ? avgReturn / volatility : 0;
            
            const negReturns = portfolioValues.filter(v => v.return < 0).map(v => v.return);
            const downVol = negReturns.length > 0 
                ? Math.sqrt(negReturns.reduce((sum, r) => sum + Math.pow(r, 2), 0) / negReturns.length)
                : 0;
            const sortinoRatio = downVol > 0 ? avgReturn / downVol : sharpeRatio;

            const drawdowns = [];
            let peak = portfolioValues[0].value;
            portfolioValues.forEach(v => {
                if (v.value > peak) peak = v.value;
                const drawdown = ((v.value - peak) / peak) * 100;
                drawdowns.push(drawdown);
            });
            const maxDrawdown = Math.min(...drawdowns);

            return {
                portfolioValues,
                trades: results,
                detailedTrades,
                currentRecommendations,
                metrics: {
                    totalReturn: totalReturn.toFixed(2),
                    annualReturn: annualReturn.toFixed(2),
                    avgReturn: avgReturn.toFixed(2),
                    volatility: volatility.toFixed(2),
                    sharpeRatio: sharpeRatio.toFixed(2),
                    sortinoRatio: sortinoRatio.toFixed(2),
                    maxDrawdown: maxDrawdown.toFixed(2),
                    trades: results.length,
                    years: totalYears.toFixed(1)
                }
            };
        }, [data, dividendData, lookbackPeriod, holdingPeriod, topN, minMomentum, useDividends, skipLastMonth, useVolFilter, maxVol, useRiskAdj, dynamicMode, marketVolThreshold]);

        // Продолжение в следующем артефакте из-за ограничения размера...
		// ЧАСТЬ 2: UI - Добавьте этот код ПОСЛЕ расчётной части

        // Рендер начального экрана загрузки
        if (loading) {
            return h('div', {
                className: 'min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 flex items-center justify-center p-6'
            },
                h('div', {
                    className: 'bg-white rounded-2xl p-8 max-w-md w-full shadow-xl border border-slate-200 text-center'
                },
                    h('div', {
                        className: 'spinner',
                        style: { border: '4px solid #f3f3f3', borderTop: '4px solid #3b82f6', borderRadius: '50%', width: '60px', height: '60px', animation: 'spin 1s linear infinite', margin: '0 auto 20px' }
                    }),
                    h('h2', { className: 'text-2xl font-bold text-slate-800 mb-2' }, 'Загрузка данных...'),
                    h('p', { className: 'text-slate-600' }, 'Получаем данные с сервера')
                )
            );
        }
        
        if (!data) {
            return h('div', {
                className: 'min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 flex items-center justify-center p-6'
            },
                h('div', {
                    className: 'bg-white rounded-2xl p-8 max-w-md w-full shadow-xl border border-slate-200'
                },
                    h('h1', {
                        className: 'text-3xl font-bold text-slate-800 mb-2 text-center'
                    }, 'Оптимизатор Momentum Стратегии'),
                    h('p', {
                        className: 'text-slate-600 mb-6 text-center'
                    }, 'Данные загружаются администратором сайта'),
                    
                    error && h('div', {
                        className: 'bg-amber-50 border border-amber-200 rounded-lg p-4 mb-4'
                    },
                        h('p', { className: 'text-amber-800 font-semibold mb-2' }, '⚠️ Данные не загружены'),
                        h('p', { className: 'text-amber-700 text-sm' }, error),
                        h('p', { className: 'text-amber-600 text-xs mt-2' }, 'Администратор должен загрузить Excel файл через админ-панель WordPress.')
                    ),
                    
                    h('button', {
                        onClick: loadMarketData,
                        className: 'w-full bg-blue-500 hover:bg-blue-600 text-white font-semibold py-3 px-4 rounded-lg transition shadow-sm'
                    }, '🔄 Попробовать снова'),
                    
                    dataUpdatedAt && h('p', {
                        className: 'text-slate-500 text-xs mt-4 text-center'
                    }, `Последнее обновление данных: ${dataUpdatedAt}`)
                )
            );
        }

        // Рендер главного интерфейса с результатами
        return h('div', {
            className: 'min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 p-6'
        },
            h('div', { className: 'max-w-7xl mx-auto' },
                // Шапка
                h('div', { className: 'flex justify-between items-center mb-6' },
                    h('div', null,
                        h('h1', {
                            className: 'text-4xl font-bold text-slate-800 mb-2'
                        }, 'Оптимизатор Momentum Стратегии'),
                        stats && h('p', {
                            className: 'text-slate-600'
                        }, `Российский рынок акций • ${stats.periods} месяцев • ${stats.totalTickers} тикеров (сейчас торгуется ${stats.activeTickers})`)
                    ),
                    h('div', { className: 'text-right' },
                        dataUpdatedAt && h('div', {
                            className: 'bg-blue-50 border border-blue-200 rounded-lg px-4 py-2 mb-2'
                        },
                            h('div', { className: 'text-xs text-slate-600' }, 'Данные обновлены'),
                            h('div', { className: 'text-sm font-semibold text-slate-800' }, dataUpdatedAt)
                        ),
                        h('button', {
                            onClick: loadMarketData,
                            className: 'bg-white hover:bg-slate-50 text-slate-700 px-4 py-2 rounded-lg transition border border-slate-300 shadow-sm text-sm'
                        }, '🔄 Обновить данные')
                    )
                ),

                // Параметры стратегии
                h('div', { className: 'grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6' },
                    // Lookback Period
                    h('div', { className: 'bg-white rounded-xl p-6 shadow-lg border border-slate-200' },
                        h('label', { className: 'block text-slate-700 font-semibold mb-2' }, 'Период расчета momentum (мес)'),
                        h('input', {
                            type: 'range',
                            min: '2',
                            max: '12',
                            value: lookbackPeriod,
                            onChange: (e) => setLookbackPeriod(Number(e.target.value)),
                            className: 'w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer'
                        }),
                        h('div', {
                            className: 'text-blue-600 text-2xl font-bold mt-2 text-center'
                        }, `${lookbackPeriod} мес`),
                        h('p', {
                            className: 'text-slate-500 text-sm mt-2'
                        }, 'За какой период считаем доходность для ранжирования акций')
                    ),

                    // Holding Period
                    h('div', { className: 'bg-white rounded-xl p-6 shadow-lg border border-slate-200' },
                        h('label', { className: 'block text-slate-700 font-semibold mb-2' }, 'Период удержания (мес)'),
                        h('input', {
                            type: 'range',
                            min: '1',
                            max: '6',
                            value: holdingPeriod,
                            onChange: (e) => setHoldingPeriod(Number(e.target.value)),
                            className: 'w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer'
                        }),
                        h('div', {
                            className: 'text-green-600 text-2xl font-bold mt-2 text-center'
                        }, `${holdingPeriod} мес`),
                        h('p', {
                            className: 'text-slate-500 text-sm mt-2'
                        }, 'Как долго держим позиции перед ребалансировкой')
                    ),

                    // Top N
                    h('div', { className: 'bg-white rounded-xl p-6 shadow-lg border border-slate-200' },
                        h('label', { className: 'block text-slate-700 font-semibold mb-2' }, 'Количество акций в портфеле'),
                        h('input', {
                            type: 'range',
                            min: '5',
                            max: '30',
                            step: '1',
                            value: topN,
                            onChange: (e) => setTopN(Number(e.target.value)),
                            className: 'w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer'
                        }),
                        h('div', {
                            className: 'text-purple-600 text-2xl font-bold mt-2 text-center'
                        }, `${topN} акций`),
                        h('p', {
                            className: 'text-slate-500 text-sm mt-2'
                        }, 'Топ N акций с наибольшим momentum')
                    ),
                    
                    // НОВЫЙ: Минимальный моментум для входа
                    h('div', { className: 'bg-white rounded-xl p-6 shadow-lg border border-slate-200' },
                        h('label', { className: 'block text-slate-700 font-semibold mb-2' }, 'Мин. momentum для входа (%)'),
                        h('input', {
                            type: 'range',
                            min: '-50',
                            max: '50',
                            step: '1',
                            value: minMomentum,
                            onChange: (e) => setMinMomentum(Number(e.target.value)),
                            className: 'w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer'
                        }),
                        h('div', {
                            className: `text-2xl font-bold mt-2 text-center ${minMomentum < 0 ? 'text-red-600' : 'text-emerald-600'}`
                        }, `${minMomentum > 0 ? '+' : ''}${minMomentum}%`),
                        h('p', {
                            className: 'text-slate-500 text-sm mt-2'
                        }, 'Акции с моментумом ниже этого значения уходят в кеш (RUB)')
                    )
                ),

                // Дополнительные настройки
                h('div', { className: 'grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6' },
                    h('div', { className: 'bg-gradient-to-br from-amber-50 to-orange-50 rounded-xl p-4 border border-amber-200 shadow-sm' },
                        h('div', { className: 'flex items-center justify-between' },
                            h('div', null,
                                h('h3', {
                                    className: 'text-slate-800 font-semibold mb-1'
                                }, `Учет дивидендов ${dividendData ? '(данные найдены)' : '(цены adjusted)'}`),
                                h('p', {
                                    className: 'text-slate-600 text-sm'
                                }, useDividends 
                                    ? 'Полная доходность: рост цены + дивиденды' 
                                    : 'Только рост цены (без дивидендов)')
                            ),
                            h('button', {
                                onClick: () => setUseDividends(!useDividends),
                                className: `px-6 py-2 rounded-lg font-semibold transition shadow-sm ${
                                    useDividends 
                                        ? 'bg-green-500 hover:bg-green-600 text-white' 
                                        : 'bg-white hover:bg-slate-50 text-slate-600 border border-slate-300'
                                }`
                            }, useDividends ? 'Включено' : 'Выключено')
                        )
                    ),

                    h('div', { className: 'bg-gradient-to-br from-indigo-50 to-purple-50 rounded-xl p-4 border border-indigo-200 shadow-sm' },
                        h('div', { className: 'flex items-center justify-between' },
                            h('div', null,
                                h('h3', {
                                    className: 'text-slate-800 font-semibold mb-1'
                                }, 'Фильтр последнего месяца (Reversal Effect)'),
                                h('p', {
                                    className: 'text-slate-600 text-sm'
                                }, skipLastMonth 
                                    ? `Считаем momentum за ${lookbackPeriod} мес, исключая последний месяц` 
                                    : `Стандартный расчет за ${lookbackPeriod} месяцев`)
                            ),
                            h('button', {
                                onClick: () => setSkipLastMonth(!skipLastMonth),
                                className: `px-6 py-2 rounded-lg font-semibold transition shadow-sm ${
                                    skipLastMonth 
                                        ? 'bg-green-500 hover:bg-green-600 text-white' 
                                        : 'bg-white hover:bg-slate-50 text-slate-600 border border-slate-300'
                                }`
                            }, skipLastMonth ? 'Включено' : 'Выключено')
                        )
                    )
                ),

                // Продолжение UI в следующей части...
// ЧАСТЬ 3: Фильтры и метрики - добавьте после предыдущей части

                // Фильтры волатильности и динамический режим
                h('div', { className: 'grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6' },
                    h('div', { className: 'bg-gradient-to-br from-rose-50 to-pink-50 rounded-xl p-4 border border-rose-200 shadow-sm' },
                        h('div', { className: 'flex items-center justify-between mb-3' },
                            h('h3', { className: 'text-slate-800 font-semibold' }, 'Фильтр волатильности'),
                            h('button', {
                                onClick: () => setUseVolFilter(!useVolFilter),
                                className: `px-4 py-1 rounded-lg font-semibold transition text-sm shadow-sm ${
                                    useVolFilter 
                                        ? 'bg-green-500 hover:bg-green-600 text-white' 
                                        : 'bg-white hover:bg-slate-50 text-slate-600 border border-slate-300'
                                }`
                            }, useVolFilter ? 'ВКЛ' : 'ВЫКЛ')
                        ),
                        useVolFilter && h('div', null,
                            h('label', { className: 'text-slate-700 text-sm block mb-1' }, `Макс. волатильность: ${maxVol}%`),
                            h('input', {
                                type: 'range',
                                min: '20',
                                max: '100',
                                step: '5',
                                value: maxVol,
                                onChange: (e) => setMaxVol(Number(e.target.value)),
                                className: 'w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer'
                            }),
                            h('p', {
                                className: 'text-slate-600 text-xs mt-2'
                            }, 'Исключает акции с волатильностью выше порога')
                        ),
                        h('div', { className: 'flex items-center justify-between mt-3 pt-3 border-t border-rose-200' },
                            h('span', { className: 'text-slate-700 text-sm' }, 'Риск-корректированный momentum'),
                            h('button', {
                                onClick: () => setUseRiskAdj(!useRiskAdj),
                                className: `px-3 py-1 rounded text-xs font-semibold transition shadow-sm ${
                                    useRiskAdj 
                                        ? 'bg-green-500 hover:bg-green-600 text-white' 
                                        : 'bg-white hover:bg-slate-50 text-slate-600 border border-slate-300'
                                }`
                            }, useRiskAdj ? 'ВКЛ' : 'ВЫКЛ')
                        ),
                        useRiskAdj && h('p', {
                            className: 'text-slate-600 text-xs mt-2'
                        }, 'Momentum делится на волатильность (momentum/vol)')
                    ),

                    h('div', { className: 'bg-gradient-to-br from-cyan-50 to-blue-50 rounded-xl p-4 border border-cyan-200 shadow-sm' },
                        h('div', { className: 'flex items-center justify-between mb-3' },
                            h('h3', { className: 'text-slate-800 font-semibold' }, 'Динамический режим'),
                            h('button', {
                                onClick: () => setDynamicMode(!dynamicMode),
                                className: `px-4 py-1 rounded-lg font-semibold transition text-sm shadow-sm ${
                                    dynamicMode 
                                        ? 'bg-green-500 hover:bg-green-600 text-white' 
                                        : 'bg-white hover:bg-slate-50 text-slate-600 border border-slate-300'
                                }`
                            }, dynamicMode ? 'ВКЛ' : 'ВЫКЛ')
                        ),
                        dynamicMode && h('div', null,
                            h('label', { className: 'text-slate-700 text-sm block mb-1' }, `Порог рыночной волатильности: ${marketVolThreshold}%`),
                            h('input', {
                                type: 'range',
                                min: '15',
                                max: '50',
                                step: '5',
                                value: marketVolThreshold,
                                onChange: (e) => setMarketVolThreshold(Number(e.target.value)),
                                className: 'w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer'
                            }),
                            h('p', {
                                className: 'text-slate-600 text-xs mt-2'
                            }, 'При высокой рыночной волатильности увеличиваем диверсификацию (+50%), при низкой — концентрируем портфель (-30%)')
                        )
                    )
                ),

                // Метрики
                result && h('div', { className: 'grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6' },
                    h('div', { className: 'bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl p-4 shadow-lg text-white' },
                        h('div', { className: 'text-blue-100 text-sm' }, 'Общая доходность'),
                        h('div', { className: 'text-white text-3xl font-bold' }, `${result.metrics.totalReturn}%`)
                    ),
                    h('div', { className: 'bg-gradient-to-br from-green-500 to-green-600 rounded-xl p-4 shadow-lg text-white' },
                        h('div', { className: 'text-green-100 text-sm' }, 'Годовая доходность'),
                        h('div', { className: 'text-white text-3xl font-bold' }, `${result.metrics.annualReturn}%`)
                    ),
                    h('div', { className: 'bg-gradient-to-br from-purple-500 to-purple-600 rounded-xl p-4 shadow-lg text-white' },
                        h('div', { className: 'text-purple-100 text-sm' }, 'Коэф. Шарпа'),
                        h('div', { className: 'text-white text-3xl font-bold' }, result.metrics.sharpeRatio)
                    ),
                    h('div', { className: 'bg-gradient-to-br from-amber-500 to-orange-500 rounded-xl p-4 shadow-lg text-white' },
                        h('div', { className: 'text-amber-100 text-sm' }, 'Коэф. Сортино'),
                        h('div', { className: 'text-white text-3xl font-bold' }, result.metrics.sortinoRatio)
                    ),
                    h('div', { className: 'bg-gradient-to-br from-red-500 to-red-600 rounded-xl p-4 shadow-lg text-white' },
                        h('div', { className: 'text-red-100 text-sm' }, 'Макс. просадка'),
                        h('div', { className: 'text-white text-3xl font-bold' }, `${result.metrics.maxDrawdown}%`)
                    )
                ),

                // Дополнительные метрики
                result && h('div', { className: 'grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6' },
                    h('div', { className: 'bg-white rounded-xl p-4 text-center border border-slate-200 shadow-sm' },
                        h('div', { className: 'text-slate-500 text-sm' }, 'Средняя доходность периода'),
                        h('div', { className: 'text-slate-800 text-2xl font-bold' }, `${result.metrics.avgReturn}%`)
                    ),
                    h('div', { className: 'bg-white rounded-xl p-4 text-center border border-slate-200 shadow-sm' },
                        h('div', { className: 'text-slate-500 text-sm' }, 'Волатильность'),
                        h('div', { className: 'text-slate-800 text-2xl font-bold' }, `${result.metrics.volatility}%`)
                    ),
                    h('div', { className: 'bg-white rounded-xl p-4 text-center border border-slate-200 shadow-sm' },
                        h('div', { className: 'text-slate-500 text-sm' }, 'Количество сделок'),
                        h('div', { className: 'text-slate-800 text-2xl font-bold' }, result.metrics.trades),
                        h('div', { className: 'text-slate-400 text-xs mt-1' }, `за ${result.metrics.years} лет`)
                    )
                ),

                // Текущие рекомендации - продолжение в следующей части...
// ЧАСТЬ 4: Рекомендации и завершение - добавьте после предыдущей части

                // Текущие рекомендации
                result && result.currentRecommendations && h('div', { className: 'mb-6 bg-gradient-to-br from-emerald-50 to-green-50 rounded-xl p-6 shadow-lg border-2 border-green-300' },
                    h('div', { className: 'flex items-center justify-between mb-4' },
                        h('div', null,
                            h('h2', { className: 'text-2xl font-bold text-slate-800 mb-1' }, 'Текущие рекомендации'),
                            h('p', { className: 'text-slate-600' }, `Акции для покупки на ${result.currentRecommendations.date}`),
                            result.currentRecommendations.filteredStocks > 0 && h('p', { className: 'text-amber-600 text-sm mt-1' }, 
                                `⚠️ ${result.currentRecommendations.filteredStocks} ${result.currentRecommendations.filteredStocks === 1 ? 'акция' : 'акций'} отфильтровано по минимальному momentum`)
                        ),
                        h('div', { className: 'text-right' },
                            h('div', { className: 'text-slate-600 text-sm' }, 'Размер портфеля'),
                            h('div', { className: 'text-slate-800 text-3xl font-bold' }, result.currentRecommendations.portfolioSize),
                            h('div', { className: 'text-slate-500 text-xs mt-1' }, `Рыночная волатильность: ${result.currentRecommendations.marketVolatility}%`)
                        )
                    ),

                    h('div', { className: 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3' },
                        // Акции
                        ...result.currentRecommendations.stocks.map((stock, idx) =>
                            h('div', { 
                                key: idx, 
                                className: 'bg-white rounded-lg p-4 border-2 border-green-400 shadow-sm' 
                            },
                                h('div', { className: 'flex justify-between items-start mb-3' },
                                    h('div', null,
                                        h('div', { className: 'text-slate-800 font-bold text-xl' }, stock.ticker),
                                        h('div', { className: 'text-green-600 text-sm' }, `Вес: ${stock.weight}%`)
                                    ),
                                    h('div', { className: 'text-right' },
                                        h('div', { className: 'text-slate-800 font-semibold' }, `${stock.price} ₽`),
                                        h('div', { className: 'text-xs text-slate-500' }, 'Цена')
                                    )
                                ),
                                
                                h('div', { className: 'space-y-2 text-sm border-t border-slate-200 pt-3' },
                                    h('div', { className: 'flex justify-between' },
                                        h('span', { className: 'text-slate-600' }, 'Доходность:'),
                                        h('span', { className: 'text-green-600 font-semibold' }, `${stock.rawReturn}%`)
                                    ),
                                    useRiskAdj ? h('div', { className: 'flex justify-between' },
                                        h('span', { className: 'text-slate-600' }, 'Риск-скор:'),
                                        h('span', { className: 'text-blue-600 font-semibold' }, stock.momentum)
                                    ) : h('div', { className: 'flex justify-between' },
                                        h('span', { className: 'text-slate-600' }, 'Momentum:'),
                                        h('span', { className: 'text-blue-600 font-semibold' }, `${stock.momentum}%`)
                                    ),
                                    h('div', { className: 'flex justify-between' },
                                        h('span', { className: 'text-slate-600' }, 'Волатильность:'),
                                        h('span', { 
                                            className: `font-semibold ${parseFloat(stock.volatility) > 40 ? 'text-red-600' : 'text-amber-600'}` 
                                        }, `${stock.volatility}%`)
                                    )
                                ),
                                
                                h('div', { className: 'mt-3 pt-3 border-t border-slate-200' },
                                    h('div', { className: 'text-xs text-slate-500' }, 'Ранг'),
                                    h('div', { className: 'text-slate-800 font-bold text-lg' }, `#${idx + 1}`)
                                )
                            )
                        ),
                        
                        // НОВОЕ: Карточка кеша (если есть кеш-позиция)
                        parseFloat(result.currentRecommendations.cashPosition) > 0 && h('div', {
                            key: 'cash',
                            className: 'bg-gradient-to-br from-amber-50 to-yellow-50 rounded-lg p-4 border-2 border-amber-400 shadow-sm'
                        },
                            h('div', { className: 'flex justify-between items-start mb-3' },
                                h('div', null,
                                    h('div', { className: 'text-slate-800 font-bold text-xl' }, 'CASH (RUB)'),
                                    h('div', { className: 'text-amber-600 text-sm' }, `Вес: ${result.currentRecommendations.cashWeight}% × ${result.currentRecommendations.filteredStocks}`)
                                ),
                                h('div', { className: 'text-right' },
                                    h('div', { className: 'text-slate-800 font-semibold' }, `${result.currentRecommendations.cashPosition}%`),
                                    h('div', { className: 'text-xs text-slate-500' }, 'Всего')
                                )
                            ),
                            
                            h('div', { className: 'space-y-2 text-sm border-t border-amber-200 pt-3' },
                                h('div', { className: 'flex justify-between' },
                                    h('span', { className: 'text-slate-600' }, 'Годовая ставка:'),
                                    h('span', { className: 'text-amber-600 font-semibold' }, '+8.0%')
                                ),
                                h('div', { className: 'flex justify-between' },
                                    h('span', { className: 'text-slate-600' }, 'Причина:'),
                                    h('span', { className: 'text-amber-600 font-semibold text-xs' }, 'Низкий momentum')
                                )
                            ),
                            
                            h('div', { className: 'mt-3 pt-3 border-t border-amber-200' },
                                h('div', { className: 'text-xs text-slate-500' }, 'Безопасная позиция'),
                                h('div', { className: 'text-slate-800 font-bold text-lg' }, '💰 Депозит')
                            )
                        )
                    ),

                    h('div', { className: 'mt-4 p-3 bg-green-100 rounded-lg border border-green-300' },
                        h('p', { className: 'text-slate-700 text-sm' },
                            h('strong', null, 'Совет:'),
                            ' Распределите капитал равными долями между всеми позициями. ',
                            parseFloat(result.currentRecommendations.cashPosition) > 0 && `Часть капитала (${result.currentRecommendations.cashPosition}%) держите в кеше/депозите под 8% годовых. `,
                            dynamicMode && (result.currentRecommendations.marketVolatility > marketVolThreshold 
                                ? `Динамический режим увеличил количество акций из-за высокой рыночной волатильности.`
                                : `Динамический режим уменьшил количество акций из-за низкой рыночной волатильности.`)
                        )
                    )
                ),

                // Таблица результатов по периодам
                result && h('div', { className: 'bg-white rounded-xl p-6 shadow-lg border border-slate-200 mb-6' },
                    h('h2', { className: 'text-2xl font-bold text-slate-800 mb-4' }, 'Результаты по периодам'),
                    h('p', { className: 'text-slate-600 text-sm mb-4' }, `Всего периодов: ${result.portfolioValues.length}`),
                    
                    h('div', { className: 'overflow-x-auto' },
                        h('table', { className: 'w-full text-left text-sm' },
                            h('thead', null,
                                h('tr', { className: 'border-b-2 border-slate-200' },
                                    h('th', { className: 'pb-3 text-slate-700 font-semibold' }, 'Дата'),
                                    h('th', { className: 'pb-3 text-slate-700 font-semibold text-right' }, 'Стоимость портфеля'),
                                    h('th', { className: 'pb-3 text-slate-700 font-semibold text-right' }, 'Доходность периода')
                                )
                            ),
                            h('tbody', null,
                                ...result.portfolioValues.slice(-20).map((pv, idx) =>
                                    h('tr', { 
                                        key: idx,
                                        className: 'border-b border-slate-100 hover:bg-slate-50'
                                    },
                                        h('td', { className: 'py-2 text-slate-700' }, pv.date),
                                        h('td', { className: 'py-2 text-slate-700 text-right font-medium' }, 
                                            `${Math.round(pv.value).toLocaleString('ru-RU')} ₽`
                                        ),
                                        h('td', { 
                                            className: `py-2 text-right font-semibold ${pv.return >= 0 ? 'text-green-600' : 'text-red-600'}` 
                                        }, `${pv.return.toFixed(2)}%`)
                                    )
                                )
                            )
                        )
                    ),
                    result.portfolioValues.length > 20 && h('p', { 
                        className: 'text-slate-500 text-xs mt-3 text-center' 
                    }, 'Показаны последние 20 периодов')
                ),

                // Рекомендации
                result && h('div', { className: 'bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl p-6 border border-blue-200 shadow-sm' },
                    h('h3', { className: 'text-xl font-bold text-slate-800 mb-3' }, 'Рекомендации по оптимизации'),
                    h('div', { className: 'space-y-2 text-slate-700' },
                        parseFloat(result.metrics.sharpeRatio) > 1 && h('p', null, '✅ Отличный коэффициент Шарпа! Стратегия показывает хорошее соотношение доходности и риска.'),
                        parseFloat(result.metrics.sharpeRatio) <= 0.5 && h('p', null, '⚠️ Низкий коэффициент Шарпа. Попробуйте увеличить период расчета momentum или изменить количество акций.'),
                        parseFloat(result.metrics.sortinoRatio) > parseFloat(result.metrics.sharpeRatio) * 1.3 && h('p', null, '✅ Коэффициент Сортино значительно выше Шарпа - стратегия хорошо защищена от нисходящих рисков.'),
                        Math.abs(parseFloat(result.metrics.maxDrawdown)) > 30 && h('p', null, `⚠️ Высокая просадка (${result.metrics.maxDrawdown}%). Рассмотрите увеличение диверсификации или используйте фильтр волатильности.`),
                        parseFloat(result.metrics.annualReturn) > 15 && h('p', null, `✅ Годовая доходность ${result.metrics.annualReturn}% превышает исторический рост рынка!`),
                        lookbackPeriod < 3 && h('p', null, '💡 Короткий период расчета может привести к высокой волатильности. Попробуйте 3-6 месяцев.'),
                        topN > 20 && h('p', null, '💡 Большое количество акций может снизить эффект momentum. Оптимум обычно 10-15 акций.'),
                        useVolFilter && h('p', null, `✅ Фильтр волатильности активен - исключаются акции с волатильностью выше ${maxVol}%.`),
                        useRiskAdj && h('p', null, '✅ Риск-корректированный momentum учитывает волатильность при выборе акций.'),
                        dynamicMode && h('p', null, '✅ Динамический режим автоматически адаптирует размер портфеля к рыночным условиям.')
                    )
                )
            )
        );
    };

    // Функция инициализации
    function initMomentumOptimizer() {
        console.log('=== Инициализация Momentum Optimizer (Google Sheets Edition) ===');
        
        const rootElement = document.getElementById('momentum-optimizer-root');
        
        if (!rootElement) {
            console.error('❌ Элемент #momentum-optimizer-root не найден');
            return;
        }
        
        console.log('✅ Элемент найден');
        
        const checks = {
            'React': typeof React !== 'undefined',
            'ReactDOM': typeof ReactDOM !== 'undefined'
        };
        
        console.log('Проверка библиотек:', checks);
        
        for (let lib in checks) {
            if (!checks[lib]) {
                const errorMsg = `Ошибка: ${lib} не загружен.`;
                console.error('❌', errorMsg);
                rootElement.innerHTML = `<div style="padding: 20px; background: #fee; color: #c00; border-radius: 8px; margin: 20px;">${errorMsg}</div>`;
                return;
            }
        }
        
        console.log('✅ Все библиотеки загружены');
        console.log('ℹ️ XLSX не требуется - данные загружаются с сервера');
        
        try {
            ReactDOM.render(h(MomentumOptimizer), rootElement);
            console.log('✅ Компонент отрендерен');
        } catch (error) {
            console.error('❌ Ошибка при рендере:', error);
            rootElement.innerHTML = `<div style="padding: 20px; background: #fee; color: #c00; border-radius: 8px; margin: 20px;">Ошибка: ${error.message}</div>`;
        }
    }

    // Задержка для загрузки React/ReactDOM
    let attempts = 0;
    function tryInit() {
        attempts++;
        if (typeof React === 'undefined' || typeof ReactDOM === 'undefined') {
            if (attempts < 30) {
                setTimeout(tryInit, 100);
            } else {
                initMomentumOptimizer();
            }
        } else {
            initMomentumOptimizer();
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', tryInit);
    } else {
        tryInit();
    }

})();