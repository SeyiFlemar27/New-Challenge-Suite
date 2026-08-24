function escapePdfText(value: string) {
  return value.replaceAll("\\", "\\\\").replaceAll("(", "\\(").replaceAll(")", "\\)").replace(/[^\x20-\x7E]/g, "?");
}

export function buildTextPdf(title: string, lines: string[]) {
  const contentLines = [title, ...lines].slice(0, 48);
  const stream = contentLines.map((line, index) => `${index === 0 ? "/F1 18 Tf" : "/F1 10 Tf"} 48 ${760 - index * 15} Td (${escapePdfText(line.slice(0, 110))}) Tj ${index === 0 ? "0 -15 Td" : ""}`).join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
    `<< /Length ${Buffer.byteLength(`BT\n${stream}\nET`, "ascii")} >>\nstream\nBT\n${stream}\nET\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"
  ];
  let output = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(output, "ascii"));
    output += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = Buffer.byteLength(output, "ascii");
  output += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n `).join("\n")}\ntrailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(output, "ascii");
}
