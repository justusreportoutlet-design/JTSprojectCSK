
import React, { useState } from 'react';
// @ts-ignore
import html2pdf from 'html2pdf.js';
import html2canvas from 'html2canvas';
import * as XLSX from 'xlsx';
import { safeWindow } from '../lib/safeStorage';

interface Props {
  targetId: string;
  title: string;
  showToast?: (message: string, type?: 'success' | 'error' | 'info') => void;
  excelData?: any[];
}

const sanitizeClonedDoc = (clonedDoc: any) => {
  try {
    const styleTags = clonedDoc.querySelectorAll('style');
    styleTags.forEach((st: any) => {
      if (st.textContent) {
        st.textContent = st.textContent
          .replace(/oklab\([^)]+\)/gi, '#0f172a')
          .replace(/oklch\([^)]+\)/gi, '#0f172a')
          .replace(/light-dark\([^)]+\)/gi, '#0f172a');
      }
    });

    const styledElements = clonedDoc.querySelectorAll('[style*="oklab"], [style*="oklch"], [style*="light-dark"]');
    styledElements.forEach((el: any) => {
      const s = el.getAttribute('style') || '';
      el.setAttribute('style', s
        .replace(/oklab\([^)]+\)/gi, '#0f172a')
        .replace(/oklch\([^)]+\)/gi, '#0f172a')
        .replace(/light-dark\([^)]+\)/gi, '#0f172a')
      );
    });
  } catch (e) {
    console.warn("Doc sanitization warning:", e);
  }
};

const ShareActions: React.FC<Props> = ({ targetId, title, showToast, excelData }) => {
  const [isGenerating, setIsGenerating] = useState(false);

  const handleShareHTML = (isWA = false) => {
    const element = document.getElementById(targetId);
    if (!element) return;

    const htmlContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>${title}</title>
          <meta charset="utf-8">
          <script src="https://cdn.tailwindcss.com"></script>
          <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css">
          <style>
            body { background-color: slate-900; color: white; font-family: sans-serif; padding: 20px; }
            .no-print { display: none !important; }
            .glass-card { background: rgba(30, 41, 59, 0.7); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 1rem; padding: 1.5rem; }
            table { width: 100%; border-collapse: collapse; }
            th, td { border: 1px solid rgba(255, 255, 255, 0.1); padding: 8px; text-align: left; }
            .bg-slate-950 { background-color: #020617; }
            .bg-slate-900 { background-color: var(--color-slate-900, #0f172a); }
          </style>
        </head>
        <body>
          <div class="max-w-7xl mx-auto">
            <h1 class="text-3xl font-black uppercase tracking-tighter mb-8 border-b border-white/10 pb-4">${title}</h1>
            ${element.innerHTML}
          </div>
        </body>
      </html>
    `;

    if (isWA) {
      const waMessage = encodeURIComponent(`Halo, berikut link laporan *${title}*. (Laporan HTML dikirim secara manual setelah diunduh)`);
      safeWindow.open(`https://wa.me/?text=${waMessage}`, '_blank');
    }

    const blob = new Blob([htmlContent], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${title.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleSharePDF = async (isWA = false) => {
    const element = document.getElementById(targetId);
    if (!element) return;

    setIsGenerating(true);
    
    const originalOverflow = element.style.overflow;
    element.style.overflow = 'visible';

    const opt = {
      margin: 5,
      filename: `${title.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`,
      image: { type: 'jpeg' as const, quality: 0.6 },
      html2canvas: { 
        scale: 1, 
        useCORS: true, 
        logging: false,
        onclone: (clonedDoc: any) => {
          sanitizeClonedDoc(clonedDoc);
          const style = clonedDoc.createElement('style');
          style.innerHTML = `
            * {
              box-shadow: none !important;
              text-shadow: none !important;
              color: #000 !important;
              border-color: #ccc !important;
              background-image: none !important;
            }
            body, div, section, article, main, aside, header, nav {
              background-color: #fff !important;
            }
            th, th * {
              background-color: #1e3a8a !important; 
              color: #fff !important;
            }
            td {
              background-color: #fff !important;
            }
            tr:nth-child(even) td {
              background-color: #f9fafb !important;
            }
          `;
          clonedDoc.head.appendChild(style);
        }
      },
      jsPDF: { unit: 'mm', format: 'a3', orientation: 'landscape' as const }
    };

    try {
      await html2pdf().set(opt).from(element).save();
      
      if (isWA) {
        const waMessage = encodeURIComponent(`Halo, berikut laporan PDF *${title}*. Silakan lampirkan file yang baru saja diunduh.`);
        safeWindow.open(`https://wa.me/?text=${waMessage}`, '_blank');
      }
      showToast?.("Laporan PDF berhasil diunduh.", "success");
    } catch (error) {
      console.error("PDF Generation Error:", error);
      showToast?.("Gagal membuat PDF. Silakan coba lagi.", "error");
    } finally {
      element.style.overflow = originalOverflow;
      setIsGenerating(false);
    }
  };

  const handleSharePhoto = async (isWA = false) => {
    const element = document.getElementById(targetId);
    if (!element) return;

    setIsGenerating(true);
    const originalOverflow = element.style.overflow;
    element.style.overflow = 'visible';

    try {
      const canvas = await html2canvas(element, {
        backgroundColor: 'transparent',
        scale: 1,
        useCORS: true,
        logging: false,
        onclone: (clonedDoc: any) => {
          sanitizeClonedDoc(clonedDoc);
          const style = clonedDoc.createElement('style');
          style.innerHTML = `
            * {
              box-shadow: none !important;
              text-shadow: none !important;
              backdrop-filter: none !important;
              -webkit-backdrop-filter: none !important;
              transition: none !important;
              animation: none !important;
              transform: none !important;
            }
          `;
          clonedDoc.head.appendChild(style);
        }
      });
      
      const imgData = canvas.toDataURL('image/png');
      const link = document.createElement('a');
      link.href = imgData;
      link.download = `${title.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.png`;
      link.click();

      if (isWA) {
        const waMessage = encodeURIComponent(`Halo, berikut screenshot laporan *${title}*. Silakan lampirkan gambar yang baru saja diunduh.`);
        safeWindow.open(`https://wa.me/?text=${waMessage}`, '_blank');
      }
      showToast?.("Gambar laporan berhasil disimpan.", "success");
    } catch (error) {
      console.error("Photo sharing error:", error);
      showToast?.("Gagal mengambil gambar. Silakan coba lagi.", "error");
    } finally {
      element.style.overflow = originalOverflow;
      setIsGenerating(false);
    }
  };

  const handleExportExcel = (isTemplate = false) => {
    if (!excelData || excelData.length === 0) {
      // If no data passed, try to extract from table if possible or show error
      showToast?.("Data tidak tersedia untuk ekspor Excel.", "error");
      return;
    }

    try {
      const ws = XLSX.utils.json_to_sheet(isTemplate ? excelData.slice(0, 1) : excelData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Report");
      
      const filename = isTemplate 
        ? `${title.replace(/\s+/g, '_')}_Template.xlsx`
        : `${title.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.xlsx`;
        
      XLSX.writeFile(wb, filename);
      showToast?.(isTemplate ? "Template berhasil diunduh." : "Excel berhasil diunduh.", "success");
    } catch (error) {
      console.error("Excel export error:", error);
      showToast?.("Gagal ekspor ke Excel.", "error");
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2 no-print mb-6">
      {/* PDF Actions */}
      <div className="flex items-center gap-1 bg-slate-900/50 p-1 rounded-xl border border-white/5">
        <button 
          onClick={() => handleSharePDF(false)}
          disabled={isGenerating}
          className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all flex items-center gap-2"
          title="Download PDF"
        >
          <i className="fas fa-file-pdf text-red-500"></i>
          <span>PDF</span>
        </button>
        <button 
          onClick={() => handleSharePDF(true)}
          disabled={isGenerating}
          className="p-2 bg-emerald-600/20 hover:bg-emerald-600/40 text-emerald-400 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all flex items-center gap-1"
          title="Share WA PDF"
        >
          <i className="fab fa-whatsapp"></i>
          <span>WA PDF</span>
        </button>
      </div>

      {/* Photo Actions */}
      <div className="flex items-center gap-1 bg-slate-900/50 p-1 rounded-xl border border-white/5">
        <button 
          onClick={() => handleSharePhoto(false)}
          disabled={isGenerating}
          className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all flex items-center gap-2"
          title="Download PNG"
        >
          <i className="fas fa-image text-blue-500"></i>
          <span>Photo</span>
        </button>
        <button 
          onClick={() => handleSharePhoto(true)}
          disabled={isGenerating}
          className="p-2 bg-emerald-600/20 hover:bg-emerald-600/40 text-emerald-400 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all flex items-center gap-1"
          title="Share WA Photo"
        >
          <i className="fab fa-whatsapp"></i>
          <span>WA Photo</span>
        </button>
      </div>

      {/* HTML Actions */}
      <div className="flex items-center gap-1 bg-slate-900/50 p-1 rounded-xl border border-white/5">
        <button 
          onClick={() => handleShareHTML(false)}
          className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all flex items-center gap-2"
          title="Download HTML"
        >
          <i className="fas fa-code text-indigo-400"></i>
          <span>HTML</span>
        </button>
        <button 
          onClick={() => handleShareHTML(true)}
          className="p-2 bg-emerald-600/20 hover:bg-emerald-600/40 text-emerald-400 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all flex items-center gap-1"
          title="Share WA HTML"
        >
          <i className="fab fa-whatsapp"></i>
          <span>WA HTML</span>
        </button>
      </div>

      {/* Excel Actions */}
      {excelData && (
        <div className="flex items-center gap-1 bg-slate-900/50 p-1 rounded-xl border border-white/5">
          <button 
            onClick={() => handleExportExcel(false)}
            className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all flex items-center gap-2"
            title="Import (Export) to Excel"
          >
            <i className="fas fa-file-excel text-emerald-500"></i>
            <span>Convert to Excel</span>
          </button>
          <button 
            onClick={() => handleExportExcel(true)}
            className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all flex items-center gap-2 underline"
            title="Download Excel Template"
          >
            <span>Template</span>
          </button>
        </div>
      )}
    </div>
  );
};

export default ShareActions;
