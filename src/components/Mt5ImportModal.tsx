import React, { useState } from 'react';
import {
  parseMt5ReportText,
  PropAccount,
  TradeExecution,
} from '../data/terminalData';

interface Mt5ImportModalProps {
  isOpen: boolean;
  activeAccount: PropAccount;
  onClose: () => void;
  onImportTrades: (trades: TradeExecution[], newBalance?: number) => void;
}

export const Mt5ImportModal: React.FC<Mt5ImportModalProps> = ({
  isOpen,
  activeAccount,
  onClose,
  onImportTrades,
}) => {
  const [activeTab, setActiveTab] = useState<'paste' | 'file'>('paste');
  const [rawText, setRawText] = useState('');
  const [parsedPreview, setParsedPreview] = useState<TradeExecution[]>([]);
  const [errorMsg, setErrorMsg] = useState('');

  if (!isOpen) return null;

  const handleParse = (textToParse: string) => {
    setErrorMsg('');
    try {
      const results = parseMt5ReportText(textToParse, activeAccount.id);
      if (results.length === 0) {
        setErrorMsg(
          'Could not detect valid MT5 deal rows. Paste lines like: "928371, 2026.10.04 14:30, buy, 0.25, XAUUSD, 2654.20, +120.00"'
        );
      }
      setParsedPreview(results);
    } catch {
      setErrorMsg('Failed to parse text. Please check format.');
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      setRawText(content);
      handleParse(content);
    };
    reader.readAsText(file);
  };

  const handleLoadSampleMt5Deals = () => {
    const sample = `981241\t2026.10.04 11:24\tbuy\t0.25\tXAUUSD\t2654.20\t2663.80\t+120.00
981238\t2026.10.04 09:15\tsell\t0.25\tXAUUSD\t2641.80\t2645.00\t-40.00
981220\t2026.10.03 14:10\tbuy\t0.40\tEURUSD\t1.08420\t1.08640\t+88.00
981205\t2026.10.02 15:45\tbuy\t0.25\tXAUUSD\t2632.50\t2640.50\t+100.00
981190\t2026.10.01 13:30\tsell\t0.50\tUS100\t20410.0\t20338.0\t+72.00`;
    setRawText(sample);
    handleParse(sample);
  };

  const handleConfirmImport = () => {
    if (parsedPreview.length === 0) return;
    const totalPnl = parsedPreview.reduce((acc, t) => acc + t.pnlValue, 0);
    const updatedBalance = Number((activeAccount.currentBalance + totalPnl).toFixed(2));
    onImportTrades(parsedPreview, updatedBalance);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
      <div className="terminal-glass rounded-2xl p-6 w-full max-w-2xl border border-white/15 max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between pb-3 border-b border-white/[0.08] mb-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-purple-500/20 border border-purple-500/40 flex items-center justify-center text-purple-300">
              <span className="material-symbols-outlined text-xl">upload_file</span>
            </div>
            <div>
              <h2 className="font-headline-sm text-base font-bold text-white leading-none">
                Import MT5 Past Trade History
              </h2>
              <span className="font-label-tech text-[10px] text-cyan-400 mt-1 block">
                TARGET ACCOUNT: {activeAccount.name} ({activeAccount.ref})
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-white/[0.04] hover:bg-white/[0.1] text-slate-400 hover:text-white flex items-center justify-center"
          >
            <span className="material-symbols-outlined text-base">close</span>
          </button>
        </div>

        {/* Tab options */}
        <div className="flex items-center gap-2 mb-4">
          <button
            type="button"
            onClick={() => setActiveTab('paste')}
            className={`px-3.5 py-1.5 rounded-xl font-label-tech text-xs font-bold transition-all ${
              activeTab === 'paste'
                ? 'bg-purple-600/30 border border-purple-500/50 text-white'
                : 'bg-white/[0.02] border border-white/10 text-slate-400'
            }`}
          >
            Paste MT5 Deals / Text
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('file')}
            className={`px-3.5 py-1.5 rounded-xl font-label-tech text-xs font-bold transition-all ${
              activeTab === 'file'
                ? 'bg-purple-600/30 border border-purple-500/50 text-white'
                : 'bg-white/[0.02] border border-white/10 text-slate-400'
            }`}
          >
            Upload MT5 Report File (.csv / .html)
          </button>
          <button
            type="button"
            onClick={handleLoadSampleMt5Deals}
            className="ml-auto px-3 py-1.5 rounded-xl bg-cyan-500/10 border border-cyan-500/30 hover:bg-cyan-500/20 text-cyan-300 font-label-tech text-[11px] font-semibold transition-all"
          >
            Insert Past Deals Template
          </button>
        </div>

        {activeTab === 'paste' ? (
          <div>
            <label className="font-label-tech text-[10px] text-slate-400 uppercase block mb-1">
              Paste MT5 Deal History Rows (CSV, Tab, or Comma-separated)
            </label>
            <textarea
              rows={5}
              value={rawText}
              onChange={(e) => {
                setRawText(e.target.value);
                handleParse(e.target.value);
              }}
              placeholder={`Ticket\tTime\tType\tVolume\tSymbol\tPrice\tProfit\n981241\t2026.10.04 11:24\tbuy\t0.25\tXAUUSD\t2654.20\t+120.00`}
              className="w-full bg-[#07090f] border border-white/10 rounded-xl p-3 font-mono text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-purple-500"
            />
          </div>
        ) : (
          <div className="p-8 border-2 border-dashed border-white/15 rounded-2xl bg-[#07090f] flex flex-col items-center justify-center text-center">
            <span className="material-symbols-outlined text-4xl text-purple-400 mb-2">
              cloud_upload
            </span>
            <span className="font-headline-sm text-sm font-bold text-white mb-1">
              Choose MT5 Statement File
            </span>
            <span className="font-body-sm text-xs text-slate-400 mb-4">
              Supports MT5 "Save as Report" (.csv, .html, .txt)
            </span>
            <label className="px-4 py-2 rounded-xl bg-purple-600 text-white font-label-tech text-xs font-bold cursor-pointer hover:bg-purple-500 transition-all">
              <span>Browse File</span>
              <input
                type="file"
                accept=".csv,.txt,.html"
                onChange={handleFileUpload}
                className="hidden"
              />
            </label>
          </div>
        )}

        {errorMsg && (
          <div className="mt-3 p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 font-body-sm text-xs">
            {errorMsg}
          </div>
        )}

        {/* Parsed Preview Table */}
        {parsedPreview.length > 0 && (
          <div className="mt-4">
            <div className="flex items-center justify-between mb-2">
              <span className="font-label-tech text-[10px] text-purple-300 uppercase font-bold">
                Parsed Deals Preview ({parsedPreview.length} executions detected)
              </span>
              <span className="font-label-numeric-sm text-xs text-emerald-400 font-bold tabular-nums">
                Net P&amp;L: +$
                {parsedPreview.reduce((acc, t) => acc + t.pnlValue, 0).toFixed(2)}
              </span>
            </div>
            <div className="max-h-48 overflow-y-auto rounded-xl border border-white/10 bg-[#090b12]">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="font-label-tech text-[10px] text-slate-500 bg-white/[0.02] border-b border-white/[0.06]">
                    <th className="py-2 px-3">Ticket</th>
                    <th className="py-2 px-3">Symbol</th>
                    <th className="py-2 px-3">Type</th>
                    <th className="py-2 px-3">Lots</th>
                    <th className="py-2 px-3">Entry</th>
                    <th className="py-2 px-3">Profit/Loss</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.04]">
                  {parsedPreview.map((t) => (
                    <tr key={t.id} className="hover:bg-white/[0.02]">
                      <td className="py-2 px-3 font-mono text-[11px] text-purple-300">{t.id}</td>
                      <td className="py-2 px-3 font-bold text-white">{t.instrument}</td>
                      <td className="py-2 px-3">
                        <span
                          className={`font-label-tech text-[9px] px-1.5 py-0.5 rounded ${
                            t.side === 'BUY'
                              ? 'bg-emerald-500/20 text-emerald-300'
                              : 'bg-rose-500/20 text-rose-300'
                          }`}
                        >
                          {t.side}
                        </span>
                      </td>
                      <td className="py-2 px-3 font-mono">{t.lots}</td>
                      <td className="py-2 px-3 font-mono text-slate-300">{t.entry}</td>
                      <td
                        className={`py-2 px-3 font-mono font-bold ${
                          t.pnlValue >= 0 ? 'text-emerald-400' : 'text-rose-400'
                        }`}
                      >
                        {t.netPnl}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className="flex items-center justify-end gap-3 pt-4 border-t border-white/[0.08] mt-4">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-slate-400 hover:text-white text-xs font-body-sm"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={parsedPreview.length === 0}
            onClick={handleConfirmImport}
            className={`px-5 py-2.5 rounded-xl font-label-tech text-xs font-bold transition-all flex items-center gap-2 ${
              parsedPreview.length > 0
                ? 'bg-gradient-to-r from-purple-600 via-indigo-600 to-cyan-500 text-white hover:brightness-110 shadow-[0_0_20px_rgba(139,92,246,0.4)]'
                : 'bg-white/10 text-slate-500 cursor-not-allowed'
            }`}
          >
            <span className="material-symbols-outlined text-base">check</span>
            <span>Import {parsedPreview.length} Trades to {activeAccount.shortRef}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
