const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const isDev = !app.isPackaged;

let ThermalPrinter = null;
let PrinterTypes = null;

try {
  const printerModule = require('node-thermal-printer');
  ThermalPrinter = printerModule.ThermalPrinter;
  PrinterTypes = printerModule.PrinterTypes;
} catch (error) {
  console.warn('node-thermal-printer is not available yet:', error.message);
}

function formatCurrency(amount) {
  return `KES ${Number(amount || 0).toLocaleString()}`;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getReceiptItems(receipt) {
  return (receipt?.items || []).map((item) => ({
    drugName: item.drug_name || item.drugName || 'Item',
    qty: item.qty_sold ?? item.qty ?? 0,
    amount: item.total_kes ?? item.total ?? 0,
  }));
}

function isShiftSummaryPrint(payload) {
  return payload?.type === 'shift-summary';
}

function buildReceiptPrintHtml(receipt) {
  const items = getReceiptItems(receipt);
  const paymentMethod = receipt?.paymentMethod || receipt?.payment_method || 'Unknown';
  const cashierName = receipt?.cashierName || receipt?.soldBy || 'Unknown';
  const receiptNumber = receipt?.receiptNumber || receipt?.saleId || '-';
  const soldAt = receipt?.soldAt || receipt?.time || '';

  return `
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>Receipt</title>
        <style>
          body { font-family: Consolas, monospace; margin: 0; padding: 24px; color: #111; }
          .receipt { max-width: 420px; margin: 0 auto; }
          .center { text-align: center; }
          .divider { border-top: 1px dashed #888; margin: 12px 0; }
          .row { display: flex; justify-content: space-between; gap: 12px; margin-bottom: 6px; }
          .meta { font-size: 12px; margin-bottom: 5px; }
          .total { font-weight: 700; font-size: 16px; }
        </style>
      </head>
      <body>
        <div class="receipt">
          <div class="center">
            <div style="font-size: 20px; font-weight: 700;">${escapeHtml(receipt?.pharmacyName || 'PharmacyOS')}</div>
            <div style="font-size: 12px;">${escapeHtml(receipt?.pharmacyLicense || '')}</div>
          </div>
          <div class="divider"></div>
          ${items.map(item => `
            <div class="row">
              <div>${escapeHtml(item.drugName)} x${escapeHtml(item.qty)}</div>
              <div>${escapeHtml(formatCurrency(item.amount))}</div>
            </div>
          `).join('')}
          <div class="divider"></div>
          <div class="row total">
            <div>TOTAL</div>
            <div>${escapeHtml(formatCurrency(receipt?.total || 0))}</div>
          </div>
          <div class="meta"><strong>Payment:</strong> ${escapeHtml(paymentMethod)}</div>
          <div class="meta"><strong>Cashier:</strong> ${escapeHtml(cashierName)}</div>
          <div class="meta"><strong>Receipt #:</strong> ${escapeHtml(receiptNumber)}</div>
          <div class="meta"><strong>Date:</strong> ${escapeHtml(soldAt)}</div>
        </div>
      </body>
    </html>
  `;
}

function buildShiftSummaryPrintHtml(summary) {
  const varianceColor = Number(summary?.variance || 0) < 0 ? '#B91C1C' : Number(summary?.variance || 0) > 0 ? '#0F6E56' : '#4B5563';

  return `
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>Shift Summary</title>
        <style>
          body { font-family: Consolas, monospace; margin: 0; padding: 24px; color: #111; }
          .summary { max-width: 460px; margin: 0 auto; }
          .title { text-align: center; font-size: 20px; font-weight: 700; margin-bottom: 12px; }
          .divider { border-top: 1px dashed #888; margin: 12px 0; }
          .row { display: flex; justify-content: space-between; gap: 12px; margin-bottom: 8px; font-size: 13px; }
          .value { font-weight: 700; }
        </style>
      </head>
      <body>
        <div class="summary">
          <div class="title">Shift Summary</div>
          <div class="divider"></div>
          <div class="row"><span>Shift Date</span><span class="value">${escapeHtml(summary?.shiftDate || '-')}</span></div>
          <div class="row"><span>Cashier</span><span class="value">${escapeHtml(summary?.cashierName || 'Staff')}</span></div>
          <div class="row"><span>Opening Float</span><span class="value">${escapeHtml(formatCurrency(summary?.openingFloat || 0))}</span></div>
          <div class="row"><span>Total Cash Sales</span><span class="value">${escapeHtml(formatCurrency(summary?.totalCashSales || 0))}</span></div>
          <div class="row"><span>Total M-Pesa Sales</span><span class="value">${escapeHtml(formatCurrency(summary?.totalMpesaSales || 0))}</span></div>
          <div class="row"><span>Total Credit Sales</span><span class="value">${escapeHtml(formatCurrency(summary?.totalCreditSales || 0))}</span></div>
          <div class="row"><span>Total SHA / Insurance</span><span class="value">${escapeHtml(formatCurrency(summary?.totalShaInsurance || 0))}</span></div>
          <div class="row"><span>Grand Total</span><span class="value">${escapeHtml(formatCurrency(summary?.grandTotal || 0))}</span></div>
          <div class="row"><span>Expected Closing Float</span><span class="value">${escapeHtml(formatCurrency(summary?.expectedClosingFloat || 0))}</span></div>
          <div class="row"><span>Actual Closing Float</span><span class="value">${escapeHtml(formatCurrency(summary?.actualClosingFloat || 0))}</span></div>
          <div class="divider"></div>
          <div class="row"><span>Variance</span><span class="value" style="color: ${varianceColor};">${escapeHtml(formatCurrency(summary?.variance || 0))}</span></div>
        </div>
      </body>
    </html>
  `;
}

function buildLabelPrintHtml(label) {
  return `
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>Prescription Label</title>
        <style>
          @page { size: 50mm 30mm; margin: 2mm; }
          body { font-family: Arial, sans-serif; margin: 0; padding: 0; color: #111; }
          .label { width: 46mm; min-height: 26mm; margin: 0 auto; padding: 2mm; box-sizing: border-box; }
          .pharmacy { text-align: center; font-size: 10px; font-weight: 700; margin-bottom: 2mm; }
          .drug { font-size: 12px; font-weight: 700; margin-bottom: 1mm; }
          .line { font-size: 9px; line-height: 1.35; margin-bottom: 1mm; }
        </style>
      </head>
      <body>
        <div class="label">
          <div class="pharmacy">${escapeHtml(label?.pharmacyName || 'PharmacyOS')}</div>
          <div class="drug">${escapeHtml(label?.drugName || 'Medicine')}</div>
          <div class="line"><strong>Patient:</strong> ${escapeHtml(label?.patientName || 'Walk-in')}</div>
          <div class="line"><strong>Dose:</strong> ${escapeHtml(label?.dose || '-')}</div>
          <div class="line">${escapeHtml(label?.instructions || '-')}</div>
          <div class="line"><strong>Date:</strong> ${escapeHtml(label?.dispensedDate || '')}</div>
          <div class="line">Pharmacist: __________________</div>
          <div class="line">${escapeHtml(label?.pharmacistName || '')}</div>
        </div>
      </body>
    </html>
  `;
}

function createPrintWindow(parentWindow, html, title) {
  return new Promise((resolve, reject) => {
    const printWindow = new BrowserWindow({
      width: 480,
      height: 640,
      title,
      show: false,
      autoHideMenuBar: true,
      parent: parentWindow || undefined,
      modal: Boolean(parentWindow),
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
      },
    });

    const dataUrl = `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;

    printWindow.webContents.once('did-finish-load', () => {
      printWindow.show();
      printWindow.focus();
      printWindow.webContents.print(
        { silent: false, printBackground: true, margins: { marginType: 'none' } },
        (success, failureReason) => {
          if (!printWindow.isDestroyed()) {
            printWindow.close();
          }
          if (!success && failureReason) {
            reject(new Error(failureReason));
            return;
          }
          resolve({ success: true, fallback: true });
        }
      );
    });

    printWindow.on('closed', () => resolve({ success: true, fallback: true }));
    printWindow.loadURL(dataUrl).catch(reject);
  });
}

async function thermalModuleAvailable() {
  return Boolean(ThermalPrinter && PrinterTypes);
}

async function createAutoPrinter() {
  if (!(await thermalModuleAvailable())) return null;
  return new ThermalPrinter({
    type: PrinterTypes.EPSON,
    interface: 'printer:auto',
    options: { timeout: 5000 },
  });
}

async function canUseThermalPrinter(printer) {
  if (!printer) return false;
  if (typeof printer.isPrinterConnected !== 'function') return true;

  try {
    return await printer.isPrinterConnected();
  } catch (error) {
    console.warn('Unable to detect thermal printer availability:', error.message);
    return false;
  }
}

async function withPrintFallback(event, html, title, printThermal) {
  const printer = await createAutoPrinter();

  if (await canUseThermalPrinter(printer)) {
    try {
      await printThermal(printer);
      return { success: true, fallback: false };
    } catch (error) {
      console.warn(`${title} thermal printing failed, falling back to browser print:`, error.message);
    }
  }

  const parentWindow = BrowserWindow.fromWebContents(event.sender);
  return createPrintWindow(parentWindow, html, title);
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 700,
    icon: path.join(__dirname, 'assets/icon.png'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    title: "PharmacyOS Desktop",
    backgroundColor: '#f0f2f0'
  });

  if (isDev) {
    // Wait for Vite to be ready before loading
    let retries = 0;
    const maxRetries = 60; // try for up to 60 seconds
    const tryLoad = () => {
      win.loadURL('http://localhost:5173')
        .catch((err) => {
          retries++;
          if (retries < maxRetries) {
            console.log(`Waiting for Vite to start... (attempt ${retries})`);
            setTimeout(tryLoad, 1000); // retry every second until Vite is up
          } else {
            console.error('Failed to connect to Vite development server after 60 seconds.');
            win.webContents.send('error', 'Failed to start development server');
          }
        });
    };
    tryLoad();
    win.webContents.openDevTools();
  } else {
    win.loadFile(path.join(__dirname, 'dist/index.html'));
  }

  win.setMenu(null);
}

app.whenReady().then(() => {
  if (isDev) {
    setTimeout(createWindow, 500); // small delay to ensure electron is fully ready
  } else {
    createWindow();
  }
});

ipcMain.handle('print-receipt', async (event, receipt) => {
  if (isShiftSummaryPrint(receipt)) {
    return withPrintFallback(event, buildShiftSummaryPrintHtml(receipt), 'Shift Summary Print', async (printer) => {
      printer.clear();
      printer.alignCenter();
      printer.bold(true);
      printer.println('Shift Summary');
      printer.bold(false);
      printer.drawLine();
      printer.alignLeft();
      printer.leftRight('Shift Date', receipt?.shiftDate || '-');
      printer.leftRight('Cashier', receipt?.cashierName || 'Staff');
      printer.leftRight('Opening Float', formatCurrency(receipt?.openingFloat || 0));
      printer.leftRight('Cash Sales', formatCurrency(receipt?.totalCashSales || 0));
      printer.leftRight('M-Pesa Sales', formatCurrency(receipt?.totalMpesaSales || 0));
      printer.leftRight('Credit Sales', formatCurrency(receipt?.totalCreditSales || 0));
      printer.leftRight('SHA/Insurance', formatCurrency(receipt?.totalShaInsurance || 0));
      printer.leftRight('Grand Total', formatCurrency(receipt?.grandTotal || 0));
      printer.leftRight('Expected Float', formatCurrency(receipt?.expectedClosingFloat || 0));
      printer.leftRight('Actual Float', formatCurrency(receipt?.actualClosingFloat || 0));
      printer.drawLine();
      printer.leftRight('Variance', formatCurrency(receipt?.variance || 0));
      printer.cut();

      await printer.execute();
    });
  }

  const items = getReceiptItems(receipt);
  const paymentMethod = receipt?.paymentMethod || receipt?.payment_method || 'Unknown';
  const cashierName = receipt?.cashierName || receipt?.soldBy || 'Unknown';
  const receiptNumber = receipt?.receiptNumber || receipt?.saleId || '-';
  const soldAt = receipt?.soldAt || receipt?.time || new Date().toLocaleString('en-GB');

  return withPrintFallback(event, buildReceiptPrintHtml(receipt), 'Receipt Print', async (printer) => {
    printer.clear();
    printer.alignCenter();
    printer.bold(true);
    printer.println(receipt?.pharmacyName || 'PharmacyOS');
    printer.bold(false);
    if (receipt?.pharmacyLicense) {
      printer.println(receipt.pharmacyLicense);
    }
    printer.drawLine();
    printer.alignLeft();

    items.forEach((item) => {
      printer.leftRight(
        `${item.drugName} x${item.qty}`,
        formatCurrency(item.amount)
      );
    });

    printer.drawLine();
    printer.bold(true);
    printer.leftRight('TOTAL', formatCurrency(receipt?.total || 0));
    printer.bold(false);
    printer.println(`Payment: ${paymentMethod}`);
    printer.println(`Cashier: ${cashierName}`);
    printer.println(`Receipt #: ${receiptNumber}`);
    printer.println(`Date: ${soldAt}`);
    printer.cut();

    await printer.execute();
  });
});

ipcMain.handle('print-label', async (event, label) => {
  return withPrintFallback(event, buildLabelPrintHtml(label), 'Prescription Label', async (printer) => {
    printer.clear();
    printer.alignCenter();
    printer.bold(true);
    printer.println(label?.pharmacyName || 'PharmacyOS');
    printer.bold(false);
    printer.drawLine();
    printer.alignLeft();
    printer.println(`Patient: ${label?.patientName || 'Walk-in'}`);
    printer.println(`Drug: ${label?.drugName || 'Medicine'}`);
    printer.println(`Dose: ${label?.dose || '-'}`);
    printer.println(`Instructions: ${label?.instructions || '-'}`);
    printer.println(`Date: ${label?.dispensedDate || ''}`);
    printer.println(`Pharmacist: ${label?.pharmacistName || ''}`);
    printer.cut();

    await printer.execute();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
