import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { format } from "date-fns";

interface LineItem {
  id: number;
  category: string;
  description: string;
  quantity: number;
  unit: string;
  materialCost: number;
  laborCost: number;
  subtotal: number;
}

interface QuoteData {
  id: number;
  title: string;
  totalEstimate: number;
  qualityTier: string;
  regionalMultiplier: number;
  createdAt: string;
  lineItems: LineItem[];
  property?: {
    address: string;
    zipCode?: string;
    sqft?: number;
    bedrooms?: number;
    bathrooms?: number;
    yearBuilt?: number;
  } | null;
}

const BRAND = {
  dark: [10, 22, 40] as [number, number, number],
  primary: [59, 130, 246] as [number, number, number],
  accent: [139, 92, 246] as [number, number, number],
  white: [255, 255, 255] as [number, number, number],
  muted: [148, 163, 184] as [number, number, number],
  lightBg: [241, 245, 249] as [number, number, number],
  border: [226, 232, 240] as [number, number, number],
};

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(value);
}

const tierLabels: Record<string, string> = {
  economy: "Economy",
  mid_range: "Mid Range",
  premium: "Premium",
};

function loadLogoAsDataUrl(): Promise<string | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) { resolve(null); return; }
      ctx.drawImage(img, 0, 0);
      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror = () => resolve(null);
    img.src = "/logo.png";
  });
}

export async function generateQuotePdf(quote: QuoteData): Promise<void> {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 15;
  const contentWidth = pageWidth - margin * 2;
  let y = margin;

  doc.setFillColor(...BRAND.dark);
  doc.rect(0, 0, pageWidth, 42, "F");

  const logoDataUrl = await loadLogoAsDataUrl();
  if (logoDataUrl) {
    doc.addImage(logoDataUrl, "PNG", margin, 8, 26, 26);
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.setTextColor(...BRAND.white);
  doc.text("Showstimate", margin + (logoDataUrl ? 30 : 0), 20);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(...BRAND.muted);
  doc.text("AI-Powered Renovation Estimate", margin + (logoDataUrl ? 30 : 0), 27);

  doc.setFontSize(9);
  doc.setTextColor(...BRAND.muted);
  doc.text(`Generated ${format(new Date(quote.createdAt), "MMMM d, yyyy")}  •  Quote #${quote.id}`, margin + (logoDataUrl ? 30 : 0), 34);

  y = 52;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(...BRAND.dark);
  doc.text(quote.title, margin, y);
  y += 8;

  if (quote.property) {
    doc.setFillColor(...BRAND.lightBg);
    doc.roundedRect(margin, y, contentWidth, 28, 2, 2, "F");
    doc.setDrawColor(...BRAND.border);
    doc.roundedRect(margin, y, contentWidth, 28, 2, 2, "S");

    const propY = y + 7;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(...BRAND.dark);
    doc.text("Property Details", margin + 5, propY);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(100, 116, 139);
    doc.text(quote.property.address, margin + 5, propY + 7);

    const details: string[] = [];
    if (quote.property.sqft) details.push(`${quote.property.sqft.toLocaleString()} sqft`);
    if (quote.property.bedrooms) details.push(`${quote.property.bedrooms} bed`);
    if (quote.property.bathrooms) details.push(`${quote.property.bathrooms} bath`);
    if (quote.property.yearBuilt) details.push(`Built ${quote.property.yearBuilt}`);
    if (quote.property.zipCode) details.push(`ZIP ${quote.property.zipCode}`);
    if (details.length > 0) {
      doc.text(details.join("  •  "), margin + 5, propY + 14);
    }

    y += 34;
  }

  const summaryY = y + 2;
  const boxWidth = (contentWidth - 8) / 3;

  const summaryBoxes = [
    { label: "Total Estimate", value: formatCurrency(quote.totalEstimate), color: BRAND.primary },
    { label: "Quality Tier", value: tierLabels[quote.qualityTier] || quote.qualityTier, color: BRAND.accent },
    { label: "Regional Multiplier", value: `${quote.regionalMultiplier}x`, color: BRAND.muted },
  ];

  summaryBoxes.forEach((box, i) => {
    const bx = margin + i * (boxWidth + 4);
    doc.setFillColor(...BRAND.lightBg);
    doc.roundedRect(bx, summaryY, boxWidth, 18, 2, 2, "F");
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...BRAND.muted);
    doc.text(box.label, bx + boxWidth / 2, summaryY + 6, { align: "center" });
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(...box.color);
    doc.text(box.value, bx + boxWidth / 2, summaryY + 14, { align: "center" });
  });

  y = summaryY + 26;

  const groupedItems = (quote.lineItems as LineItem[]).reduce<Record<string, LineItem[]>>((acc, item) => {
    if (!acc[item.category]) acc[item.category] = [];
    acc[item.category].push(item);
    return acc;
  }, {});

  Object.entries(groupedItems).forEach(([category, items]) => {
    doc.setFillColor(...BRAND.primary);
    doc.roundedRect(margin, y, contentWidth, 7, 1, 1, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(...BRAND.white);
    const categoryLabel = category.replace(/([A-Z])/g, " $1").replace(/^./, s => s.toUpperCase()).trim();
    doc.text(categoryLabel, margin + 4, y + 5);

    const categoryTotal = items.reduce((sum, item) => sum + item.subtotal, 0);
    doc.text(formatCurrency(categoryTotal), margin + contentWidth - 4, y + 5, { align: "right" });

    y += 9;

    const tableBody = items.map(item => [
      item.description,
      `${item.quantity} ${item.unit}`,
      formatCurrency(item.materialCost * item.quantity),
      formatCurrency(item.laborCost * item.quantity),
      formatCurrency(item.subtotal),
    ]);

    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin },
      head: [["Description", "Qty", "Materials", "Labor", "Subtotal"]],
      body: tableBody,
      theme: "plain",
      styles: {
        fontSize: 8.5,
        cellPadding: 2.5,
        textColor: BRAND.dark,
        lineWidth: 0,
      },
      headStyles: {
        fillColor: BRAND.lightBg,
        textColor: BRAND.muted,
        fontStyle: "bold",
        fontSize: 7.5,
      },
      columnStyles: {
        0: { cellWidth: "auto" },
        1: { halign: "center", cellWidth: 22 },
        2: { halign: "right", cellWidth: 25 },
        3: { halign: "right", cellWidth: 22 },
        4: { halign: "right", cellWidth: 25, fontStyle: "bold" },
      },
      alternateRowStyles: {
        fillColor: [248, 250, 252],
      },
      didParseCell: (data) => {
        if (data.section === "body") {
          data.cell.styles.lineColor = BRAND.border;
          data.cell.styles.lineWidth = { bottom: 0.1, top: 0, left: 0, right: 0 };
        }
      },
    });

    y = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;

    if (y > doc.internal.pageSize.getHeight() - 40) {
      doc.addPage();
      y = margin;
    }
  });

  y += 2;
  doc.setDrawColor(...BRAND.primary);
  doc.setLineWidth(0.5);
  doc.line(margin, y, margin + contentWidth, y);
  y += 6;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.setTextColor(...BRAND.muted);
  doc.text("Total Estimated Cost", margin, y);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.setTextColor(...BRAND.primary);
  doc.text(formatCurrency(quote.totalEstimate), margin + contentWidth, y, { align: "right" });

  y += 14;

  if (y > doc.internal.pageSize.getHeight() - 30) {
    doc.addPage();
    y = margin;
  }

  doc.setDrawColor(...BRAND.border);
  doc.setLineWidth(0.2);
  doc.line(margin, y, margin + contentWidth, y);
  y += 5;

  doc.setFont("helvetica", "italic");
  doc.setFontSize(7);
  doc.setTextColor(...BRAND.muted);
  const disclaimer = "Disclaimer: This estimate is generated by AI for informational purposes only and does not constitute a bid, contract, or guarantee of pricing. Actual renovation costs will vary based on site-specific conditions, contractor selection, material availability, permitting requirements, and other factors. Showstimate recommends obtaining at least three licensed contractor bids before making renovation decisions. Use this as a Scope of Work to gather localized bids.";
  const disclaimerLines = doc.splitTextToSize(disclaimer, contentWidth);
  doc.text(disclaimerLines, margin, y);

  const address = quote.property?.address || "Estimate";
  const sanitized = address.replace(/[^a-zA-Z0-9 ]/g, "").replace(/\s+/g, "_").substring(0, 60);
  doc.save(`Showstimate_Estimate_${sanitized}.pdf`);
}
