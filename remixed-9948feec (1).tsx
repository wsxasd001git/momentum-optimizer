import React, { useState, useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, BarChart, Bar } from 'recharts';
import * as XLSX from 'xlsx';

const MomentumOptimizer = () => {
  const [data, setData] = useState(null);
  const [dividendData, setDividendData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [lookbackPeriod, setLookbackPeriod] = useState(3);
  const [holdingPeriod, setHoldingPeriod] = useState(1);
  const [topN, setTopN] = useState(10);
  const [useDividends, setUseDividends] = useState(true);
  const [skipLastMonth, setSkipLastMonth] = useState(true);
  const [useVolFilter, setUseVolFilter] = useState(false);
  const [maxVol, setMaxVol] = useState(50);
  const [useRiskAdj, setUseRiskAdj] = useState(false);
  const [dynamicMode, setDynamicMode] = useState(false);
  const [marketVolThreshold, setMarketVolThreshold] = useState(25);
  const [selectedPeriod, setSelectedPeriod] = useState(null);

  const handleFileUpload = (event) => {
    const file = event.target.files[0];
    if (!file) return;

    setLoading(true);
    setError(null);

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array', cellDates: true });
        
        if (!workbook.SheetNames.includes('цены')) {
          throw new Error('Лист "цены" не найден. Доступные листы: ' + workbook.SheetNames.join(', '));
        }
        
        const sheet = workbook.Sheets['цены'];
        const jsonData = XLSX.utils.sheet_to_json(sheet);
        
        if (!jsonData || jsonData.length === 0) {
          throw new Error('Файл пуст');
        }
        
        setData(jsonData);
        
        const divSheetNames = ['Дивид', 'дивиденды', 'Дивиденды', 'dividends'];
        const divSheetName = divSheetNames.find(name => workbook.SheetNames.includes(name));
        
        if (divSheetName) {
          const divSheet = workbook.Sheets[divSheetName];
          const divData = XLSX.utils.sheet_to_json(divSheet);
          setDividendData(divData);
        } else {
          setDividendData(null);
        }
        
        setLoading(false);
      } catch (err) {
        setError(err.message);
        setLoading(false);
      }
    };
    
    reader.onerror = () => {
      setError('Ошибка чтения файла');
      setLoading(false);
    };
    
    reader.readAsArrayBuffer(file);
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
      
      currentRecommendations = {
        date: date.toISOString().split('T')[0],
        stocks: selectedStocks.map(s => ({
          ticker: s.ticker,
          price: s.price.toFixed(2),
          momentum: (s.momentum * 100).toFixed(2),
          rawReturn: (s.rawReturn * 100).toFixed(2),
          volatility: s.volatility.toFixed(2),
          weight: (100 / adjustedTopN).toFixed(1)
        })),
        portfolioSize: adjustedTopN,
        marketVolatility: marketVol.toFixed(2)
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
  }, [data, dividendData, lookbackPeriod, holdingPeriod, topN, useDividends, skipLastMonth, useVolFilter, maxVol, useRiskAdj, dynamicMode, marketVolThreshold]);

  if (!data) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 flex items-center justify-center p-6">
        <div className="bg-white rounded-2xl p-8 max-w-md w-full shadow-xl border border-slate-200">
          <h1 className="text-3xl font-bold text-slate-800 mb-2 text-center">
            Оптимизатор Momentum Стратегии
          </h1>
          <p className="text-slate-600 mb-6 text-center">
            Загрузите Excel файл с историческими ценами акций
          </p>
          
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
              <p className="text-red-700">{error}</p>
            </div>
          )}
          
          <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-blue-300 border-dashed rounded-xl cursor-pointer bg-blue-50 hover:bg-blue-100 transition">
            <div className="flex flex-col items-center justify-center pt-5 pb-6">
              <svg className="w-10 h-10 mb-3 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
              <p className="mb-2 text-sm text-slate-600">
                <span className="font-semibold">Нажмите для загрузки</span> или перетащите файл
              </p>
              <p className="text-xs text-slate-500">Excel файл (.xlsx)</p>
            </div>
            <input 
              type="file" 
              className="hidden" 
              accept=".xlsx,.xls"
              onChange={handleFileUpload}
              disabled={loading}
            />
          </label>
          
          {loading && (
            <div className="mt-4 text-center text-blue-600">
              Загрузка данных...
            </div>
          )}
          
          <div className="mt-6 text-slate-600 text-sm">
            <p className="font-semibold mb-2 text-slate-700">Требования к файлу:</p>
            <ul className="list-disc list-inside space-y-1 text-xs">
              <li>Формат: .xlsx или .xls</li>
              <li>Лист с названием "цены"</li>
              <li>Первая колонка: Time (даты)</li>
              <li>Остальные колонки: тикеры акций</li>
            </ul>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 p-6">
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-4xl font-bold text-slate-800 mb-2">
              Оптимизатор Momentum Стратегии
            </h1>
            {stats && (
              <p className="text-slate-600">
                Российский рынок акций • {stats.periods} месяцев • {stats.totalTickers} тикеров (сейчас торгуется {stats.activeTickers})
              </p>
            )}
          </div>
          <button
            onClick={() => setData(null)}
            className="bg-white hover:bg-slate-50 text-slate-700 px-4 py-2 rounded-lg transition border border-slate-300 shadow-sm"
          >
            Загрузить другой файл
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
          <div className="bg-white rounded-xl p-6 shadow-lg border border-slate-200">
            <label className="block text-slate-700 font-semibold mb-2">
              Период расчета momentum (мес)
            </label>
            <input
              type="range"
              min="1"
              max="12"
              value={lookbackPeriod}
              onChange={(e) => setLookbackPeriod(Number(e.target.value))}
              className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer"
            />
            <div className="text-blue-600 text-2xl font-bold mt-2 text-center">
              {lookbackPeriod} мес
            </div>
            <p className="text-slate-500 text-sm mt-2">
              За какой период считаем доходность для ранжирования акций
            </p>
          </div>

          <div className="bg-white rounded-xl p-6 shadow-lg border border-slate-200">
            <label className="block text-slate-700 font-semibold mb-2">
              Период удержания (мес)
            </label>
            <input
              type="range"
              min="1"
              max="6"
              value={holdingPeriod}
              onChange={(e) => setHoldingPeriod(Number(e.target.value))}
              className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer"
            />
            <div className="text-green-600 text-2xl font-bold mt-2 text-center">
              {holdingPeriod} мес
            </div>
            <p className="text-slate-500 text-sm mt-2">
              Как долго держим позиции перед ребалансировкой
            </p>
          </div>

          <div className="bg-white rounded-xl p-6 shadow-lg border border-slate-200">
            <label className="block text-slate-700 font-semibold mb-2">
              Количество акций в портфеле
            </label>
            <input
              type="range"
              min="5"
              max="30"
              step="1"
              value={topN}
              onChange={(e) => setTopN(Number(e.target.value))}
              className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer"
            />
            <div className="text-purple-600 text-2xl font-bold mt-2 text-center">
              {topN} акций
            </div>
            <p className="text-slate-500 text-sm mt-2">
              Топ N акций с наибольшим momentum
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          <div className="bg-gradient-to-br from-amber-50 to-orange-50 rounded-xl p-4 border border-amber-200 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-slate-800 font-semibold mb-1">
                  Учет дивидендов {dividendData ? '(данные найдены)' : '(цены adjusted)'}
                </h3>
                <p className="text-slate-600 text-sm">
                  {useDividends 
                    ? 'Полная доходность: рост цены + дивиденды' 
                    : 'Только рост цены (без дивидендов)'}
                </p>
              </div>
              <button
                onClick={() => setUseDividends(!useDividends)}
                className={`px-6 py-2 rounded-lg font-semibold transition shadow-sm ${
                  useDividends 
                    ? 'bg-green-500 hover:bg-green-600 text-white' 
                    : 'bg-white hover:bg-slate-50 text-slate-600 border border-slate-300'
                }`}
              >
                {useDividends ? 'Включено' : 'Выключено'}
              </button>
            </div>
          </div>

          <div className="bg-gradient-to-br from-indigo-50 to-purple-50 rounded-xl p-4 border border-indigo-200 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-slate-800 font-semibold mb-1">
                  Фильтр последнего месяца (Reversal Effect)
                </h3>
                <p className="text-slate-600 text-sm">
                  {skipLastMonth 
                    ? `Считаем momentum за ${lookbackPeriod} мес, исключая последний месяц` 
                    : `Стандартный расчет за ${lookbackPeriod} месяцев`}
                </p>
              </div>
              <button
                onClick={() => setSkipLastMonth(!skipLastMonth)}
                className={`px-6 py-2 rounded-lg font-semibold transition shadow-sm ${
                  skipLastMonth 
                    ? 'bg-green-500 hover:bg-green-600 text-white' 
                    : 'bg-white hover:bg-slate-50 text-slate-600 border border-slate-300'
                }`}
              >
                {skipLastMonth ? 'Включено' : 'Выключено'}
              </button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          <div className="bg-gradient-to-br from-rose-50 to-pink-50 rounded-xl p-4 border border-rose-200 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-slate-800 font-semibold">
                Фильтр волатильности
              </h3>
              <button
                onClick={() => setUseVolFilter(!useVolFilter)}
                className={`px-4 py-1 rounded-lg font-semibold transition text-sm shadow-sm ${
                  useVolFilter 
                    ? 'bg-green-500 hover:bg-green-600 text-white' 
                    : 'bg-white hover:bg-slate-50 text-slate-600 border border-slate-300'
                }`}
              >
                {useVolFilter ? 'ВКЛ' : 'ВЫКЛ'}
              </button>
            </div>
            {useVolFilter && (
              <div>
                <label className="text-slate-700 text-sm block mb-1">
                  Макс. волатильность: {maxVol}%
                </label>
                <input
                  type="range"
                  min="20"
                  max="100"
                  step="5"
                  value={maxVol}
                  onChange={(e) => setMaxVol(Number(e.target.value))}
                  className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer"
                />
                <p className="text-slate-600 text-xs mt-2">
                  Исключает акции с волатильностью выше порога
                </p>
              </div>
            )}
            <div className="flex items-center justify-between mt-3 pt-3 border-t border-rose-200">
              <span className="text-slate-700 text-sm">Риск-корректированный momentum</span>
              <button
                onClick={() => setUseRiskAdj(!useRiskAdj)}
                className={`px-3 py-1 rounded text-xs font-semibold transition shadow-sm ${
                  useRiskAdj 
                    ? 'bg-green-500 hover:bg-green-600 text-white' 
                    : 'bg-white hover:bg-slate-50 text-slate-600 border border-slate-300'
                }`}
              >
                {useRiskAdj ? 'ВКЛ' : 'ВЫКЛ'}
              </button>
            </div>
            {useRiskAdj && (
              <p className="text-slate-600 text-xs mt-2">
                Momentum делится на волатильность (momentum/vol)
              </p>
            )}
          </div>

          <div className="bg-gradient-to-br from-cyan-50 to-blue-50 rounded-xl p-4 border border-cyan-200 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-slate-800 font-semibold">
                Динамический режим
              </h3>
              <button
                onClick={() => setDynamicMode(!dynamicMode)}
                className={`px-4 py-1 rounded-lg font-semibold transition text-sm shadow-sm ${
                  dynamicMode 
                    ? 'bg-green-500 hover:bg-green-600 text-white' 
                    : 'bg-white hover:bg-slate-50 text-slate-600 border border-slate-300'
                }`}
              >
                {dynamicMode ? 'ВКЛ' : 'ВЫКЛ'}
              </button>
            </div>
            {dynamicMode && (
              <div>
                <label className="text-slate-700 text-sm block mb-1">
                  Порог рыночной волатильности: {marketVolThreshold}%
                </label>
                <input
                  type="range"
                  min="15"
                  max="50"
                  step="5"
                  value={marketVolThreshold}
                  onChange={(e) => setMarketVolThreshold(Number(e.target.value))}
                  className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer"
                />
                <p className="text-slate-600 text-xs mt-2">
                  При высокой рыночной волатильности увеличиваем диверсификацию (+50%), при низкой — концентрируем портфель (-30%)
                </p>
              </div>
            )}
          </div>
        </div>

        {result && (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
              <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl p-4 shadow-lg text-white">
                <div className="text-blue-100 text-sm">Общая доходность</div>
                <div className="text-white text-3xl font-bold">{result.metrics.totalReturn}%</div>
              </div>
              <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-xl p-4 shadow-lg text-white">
                <div className="text-green-100 text-sm">Годовая доходность</div>
                <div className="text-white text-3xl font-bold">{result.metrics.annualReturn}%</div>
              </div>
              <div className="bg-gradient-to-br from-purple-500 to-purple-600 rounded-xl p-4 shadow-lg text-white">
                <div className="text-purple-100 text-sm">Коэф. Шарпа</div>
                <div className="text-white text-3xl font-bold">{result.metrics.sharpeRatio}</div>
              </div>
              <div className="bg-gradient-to-br from-amber-500 to-orange-500 rounded-xl p-4 shadow-lg text-white">
                <div className="text-amber-100 text-sm">Коэф. Сортино</div>
                <div className="text-white text-3xl font-bold">{result.metrics.sortinoRatio}</div>
              </div>
              <div className="bg-gradient-to-br from-red-500 to-red-600 rounded-xl p-4 shadow-lg text-white">
                <div className="text-red-100 text-sm">Макс. просадка</div>
                <div className="text-white text-3xl font-bold">{result.metrics.maxDrawdown}%</div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
              <div className="bg-white rounded-xl p-4 text-center border border-slate-200 shadow-sm">
                <div className="text-slate-500 text-sm">Средняя доходность периода</div>
                <div className="text-slate-800 text-2xl font-bold">{result.metrics.avgReturn}%</div>
              </div>
              <div className="bg-white rounded-xl p-4 text-center border border-slate-200 shadow-sm">
                <div className="text-slate-500 text-sm">Волатильность</div>
                <div className="text-slate-800 text-2xl font-bold">{result.metrics.volatility}%</div>
              </div>
              <div className="bg-white rounded-xl p-4 text-center border border-slate-200 shadow-sm">
                <div className="text-slate-500 text-sm">Количество сделок</div>
                <div className="text-slate-800 text-2xl font-bold">{result.metrics.trades}</div>
                <div className="text-slate-400 text-xs mt-1">за {result.metrics.years} лет</div>
              </div>
            </div>

            <div className="bg-white rounded-xl p-6 shadow-lg mb-6 border border-slate-200">
              <h2 className="text-2xl font-bold text-slate-800 mb-4">Кривая капитала</h2>
              <ResponsiveContainer width="100%" height={400}>
                <LineChart data={result.portfolioValues}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis 
                    dataKey="date" 
                    stroke="#64748b"
                    tick={{ fill: '#64748b' }}
                  />
                  <YAxis 
                    stroke="#64748b"
                    tick={{ fill: '#64748b' }}
                  />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: '#ffffff', 
                      border: '1px solid #e2e8f0',
                      borderRadius: '8px'
                    }}
                    labelStyle={{ color: '#1e293b' }}
                  />
                  <Legend wrapperStyle={{ color: '#1e293b' }} />
                  <Line 
                    type="monotone" 
                    dataKey="value" 
                    stroke="#3b82f6" 
                    strokeWidth={3}
                    name="Стоимость портфеля (₽)"
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>

            <div className="bg-white rounded-xl p-6 shadow-lg border border-slate-200 mb-6">
              <h2 className="text-2xl font-bold text-slate-800 mb-4">Распределение доходности периодов</h2>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={result.portfolioValues.slice(-50)}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis 
                    dataKey="date" 
                    stroke="#64748b"
                    tick={{ fill: '#64748b', fontSize: 10 }}
                  />
                  <YAxis 
                    stroke="#64748b"
                    tick={{ fill: '#64748b' }}
                  />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: '#ffffff', 
                      border: '1px solid #e2e8f0',
                      borderRadius: '8px'
                    }}
                  />
                  <Bar 
                    dataKey="return" 
                    fill="#10b981"
                    name="Доходность периода (%)"
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {result.currentRecommendations && (
              <div className="mb-6 bg-gradient-to-br from-emerald-50 to-green-50 rounded-xl p-6 shadow-lg border-2 border-green-300">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="text-2xl font-bold text-slate-800 mb-1">
                      Текущие рекомендации
                    </h2>
                    <p className="text-slate-600">
                      Акции для покупки на {result.currentRecommendations.date}
                    </p>
                  </div>
                  <div className="text-right">
                    <div className="text-slate-600 text-sm">Размер портфеля</div>
                    <div className="text-slate-800 text-3xl font-bold">{result.currentRecommendations.portfolioSize}</div>
                    <div className="text-slate-500 text-xs mt-1">
                      Рыночная волатильность: {result.currentRecommendations.marketVolatility}%
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                  {result.currentRecommendations.stocks.map((stock, idx) => (
                    <div key={idx} className="bg-white rounded-lg p-4 border-2 border-green-400 shadow-sm">
                      <div className="flex justify-between items-start mb-3">
                        <div>
                          <div className="text-slate-800 font-bold text-xl">{stock.ticker}</div>
                          <div className="text-green-600 text-sm">Вес: {stock.weight}%</div>
                        </div>
                        <div className="text-right">
                          <div className="text-slate-800 font-semibold">{stock.price} ₽</div>
                          <div className="text-xs text-slate-500">Цена</div>
                        </div>
                      </div>
                      
                      <div className="space-y-2 text-sm border-t border-slate-200 pt-3">
                        <div className="flex justify-between">
                          <span className="text-slate-600">Доходность:</span>
                          <span className="text-green-600 font-semibold">{stock.rawReturn}%</span>
                        </div>
                        {useRiskAdj ? (
                          <div className="flex justify-between">
                            <span className="text-slate-600">Риск-скор:</span>
                            <span className="text-blue-600 font-semibold">{stock.momentum}</span>
                          </div>
                        ) : (
                          <div className="flex justify-between">
                            <span className="text-slate-600">Momentum:</span>
                            <span className="text-blue-600 font-semibold">{stock.momentum}%</span>
                          </div>
                        )}
                        <div className="flex justify-between">
                          <span className="text-slate-600">Волатильность:</span>
                          <span className={`font-semibold ${parseFloat(stock.volatility) > 40 ? 'text-red-600' : 'text-amber-600'}`}>
                            {stock.volatility}%
                          </span>
                        </div>
                      </div>
                      
                      <div className="mt-3 pt-3 border-t border-slate-200">
                        <div className="text-xs text-slate-500">Ранг</div>
                        <div className="text-slate-800 font-bold text-lg">#{idx + 1}</div>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-4 p-3 bg-green-100 rounded-lg border border-green-300">
                  <p className="text-slate-700 text-sm">
                    <strong>Совет:</strong> Распределите капитал равными долями между всеми акциями. 
                    {dynamicMode && ` Динамический режим ${result.currentRecommendations.marketVolatility > marketVolThreshold ? 'увеличил' : 'уменьшил'} количество акций из-за ${result.currentRecommendations.marketVolatility > marketVolThreshold ? 'высокой' : 'низкой'} рыночной волатильности.`}
                  </p>
                </div>
              </div>
            )}

            <div className="bg-white rounded-xl p-6 shadow-lg border border-slate-200 mb-6">
              <h2 className="text-2xl font-bold text-slate-800 mb-4">История сделок</h2>
              <p className="text-slate-600 text-sm mb-4">
                Кликните на период, чтобы увидеть детали по каждой акции
              </p>
              
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-slate-200">
                      <th className="pb-3 text-slate-700 font-semibold">Дата покупки</th>
                      <th className="pb-3 text-slate-700 font-semibold">Дата продажи</th>
                      <th className="pb-3 text-slate-700 font-semibold text-center">Акций в портфеле</th>
                      <th className="pb-3 text-slate-700 font-semibold text-right">Доходность</th>
                      <th className="pb-3 text-slate-700 font-semibold text-center">Детали</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.detailedTrades.map((trade, idx) => (
                      <React.Fragment key={idx}>
                        <tr className="border-b border-slate-100 hover:bg-slate-50 cursor-pointer" onClick={() => setSelectedPeriod(selectedPeriod === idx ? null : idx)}>
                          <td className="py-3 text-slate-700">{trade.date}</td>
                          <td className="py-3 text-slate-700">{trade.sellDate}</td>
                          <td className="py-3 text-slate-700 text-center">{trade.stockCount}</td>
                          <td className={`py-3 text-right font-semibold ${parseFloat(trade.totalReturn) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {trade.totalReturn}%
                          </td>
                          <td className="py-3 text-center">
                            <button className="text-blue-600 hover:text-blue-700">
                              {selectedPeriod === idx ? '▼ Скрыть' : '▶ Показать'}
                            </button>
                          </td>
                        </tr>
                        {selectedPeriod === idx && (
                          <tr>
                            <td colSpan="5" className="bg-slate-50 p-4">
                              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                                {trade.stocks.map((stock, sIdx) => (
                                  <div key={sIdx} className="bg-white rounded-lg p-3 border border-slate-200 shadow-sm">
                                    <div className="flex justify-between items-start mb-2">
                                      <span className="text-slate-800 font-bold text-lg">{stock.ticker}</span>
                                      <span className={`font-bold ${parseFloat(stock.return) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                        {stock.return}%
                                      </span>
                                    </div>
                                    <div className="space-y-1 text-sm">
                                      <div className="flex justify-between text-slate-600">
                                        <span>Покупка:</span>
                                        <span className="text-slate-800">{stock.buyPrice} ₽</span>
                                      </div>
                                      <div className="flex justify-between text-slate-600">
                                        <span>Продажа:</span>
                                        <span className="text-slate-800">{stock.sellPrice} ₽</span>
                                      </div>
                                      <div className="flex justify-between text-slate-600">
                                        <span>Вес в портфеле:</span>
                                        <span className="text-slate-800">{stock.weight}%</span>
                                      </div>
                                      <div className="flex justify-between text-slate-600">
                                        <span>Momentum:</span>
                                        <span className="text-slate-800">{(stock.momentum * 100).toFixed(2)}%</span>
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl p-6 border border-blue-200 shadow-sm">
              <h3 className="text-xl font-bold text-slate-800 mb-3">Рекомендации</h3>
              <div className="space-y-2 text-slate-700">
                {parseFloat(result.metrics.sharpeRatio) > 1 && (
                  <p>Отличный коэффициент Шарпа! Стратегия показывает хорошее соотношение доходности и риска.</p>
                )}
                {parseFloat(result.metrics.sharpeRatio) <= 0.5 && (
                  <p>Низкий коэффициент Шарпа. Попробуйте увеличить период расчета momentum или изменить количество акций.</p>
                )}
                {parseFloat(result.metrics.sortinoRatio) > parseFloat(result.metrics.sharpeRatio) * 1.3 && (
                  <p>Коэффициент Сортино значительно выше Шарпа - стратегия хорошо защищена от нисходящих рисков.</p>
                )}
                {Math.abs(parseFloat(result.metrics.maxDrawdown)) > 30 && (
                  <p>Высокая просадка ({result.metrics.maxDrawdown}%). Рассмотрите увеличение диверсификации или используйте фильтр волатильности.</p>
                )}
                {parseFloat(result.metrics.annualReturn) > 15 && (
                  <p>Годовая доходность {result.metrics.annualReturn}% превышает исторический рост рынка!</p>
                )}
                {lookbackPeriod < 3 && (
                  <p>Короткий период расчета может привести к высокой волатильности. Попробуйте 3-6 месяцев.</p>
                )}
                {topN > 20 && (
                  <p>Большое количество акций может снизить эффект momentum. Оптимум обычно 10-15 акций.</p>
                )}
                {useVolFilter && (
                  <p>Фильтр волатильности активен - исключаются акции с волатильностью выше {maxVol}%.</p>
                )}
                {useRiskAdj && (
                  <p>Риск-корректированный momentum учитывает волатильность при выборе акций.</p>
                )}
                {dynamicMode && (
                  <p>Динамический режим автоматически адаптирует размер портфеля к рыночным условиям.</p>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default MomentumOptimizer;
                