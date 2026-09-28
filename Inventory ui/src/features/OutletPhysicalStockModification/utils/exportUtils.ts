import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export interface UpdatedStock {
  itemName: string;
  varianceName: string;
  locationId: string;
  newValue: number;
  itemCode: string;
}

export const generateUpdatedStocksPDF = (updatedStocks: UpdatedStock[]) => {
  if (updatedStocks.length === 0) return false;

  const doc = new jsPDF();
  const timestamp = new Date().toLocaleString();
  
  doc.setFontSize(18);
  doc.text("Updated Physical Stock Report", 14, 20);
  
  doc.setFontSize(11);
  doc.text(`Generated on: ${timestamp}`, 14, 28);
  doc.text(`Total Items Updated: ${updatedStocks.length}`, 14, 35);
  
  const tableData = updatedStocks.map((stock) => [
    stock.itemName || "N/A",
    stock.varianceName || "N/A",
    stock.locationId || "N/A",
    stock.newValue !== undefined ? stock.newValue.toString() : "0",
  ]);
  
  autoTable(doc, {
    startY: 42,
    head: [["Item Name", "Variance", "Branch Name", "New Value"]],
    body: tableData,
    styles: { fontSize: 10, cellPadding: 2 },
    headStyles: { fillColor: [63, 81, 181], textColor: [255, 255, 255], fontStyle: "bold" },
    alternateRowStyles: { fillColor: [245, 245, 245] },
    margin: { left: 14, right: 14 },
  });
  
  doc.save("updated_stocks_report.pdf");
  return true;
};

export const generateUpdatedStocksExcel = (updatedStocks: UpdatedStock[]) => {
  if (updatedStocks.length === 0) return false;

  const formattedData = updatedStocks.map((stock) => ({
    "Item Name": stock.itemName || "N/A",
    "Variance": stock.varianceName || "N/A",
    "Branch Name": stock.locationId || "N/A",
    "New Value": stock.newValue !== undefined ? stock.newValue : 0,
  }));
  
  const ws = XLSX.utils.json_to_sheet(formattedData);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Updated Stocks");
  XLSX.writeFile(wb, "updated_stocks.xlsx");
  return true;
};
