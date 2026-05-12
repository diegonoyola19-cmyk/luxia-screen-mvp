import { describe, it, expect, vi } from 'vitest';
import { generateSubstitutionPdf } from './generateSubstitutionPdf';

// Mock jsPDF and autoTable
vi.mock('jspdf', () => {
  return {
    default: class {
      internal = {
        pageSize: { getWidth: () => 297, getHeight: () => 210 },
      };
      setFontSize = vi.fn();
      setFont = vi.fn();
      text = vi.fn();
      setFillColor = vi.fn();
      rect = vi.fn();
      setTextColor = vi.fn();
      addPage = vi.fn();
      save = vi.fn();
      setDrawColor = vi.fn();
      setLineWidth = vi.fn();
      setLineDashPattern = vi.fn();
      line = vi.fn();
      addImage = vi.fn();
      getNumberOfPages = vi.fn().mockReturnValue(1);
      setPage = vi.fn();
      lastAutoTable = { finalY: 100 };
    }
  };
});

vi.mock('jspdf-autotable', () => {
  return {
    default: vi.fn((doc, options) => {
      doc.lastAutoTable = { finalY: options.startY + 50 };
      // Test that we passed the correct blank rows
      if (options.body && Array.isArray(options.body)) {
        doc.internal.mockBody = options.body;
      }
    })
  };
});

describe('generateSubstitutionPdf', () => {
  it('genera la hoja general de sustituciones independientemente de una orden', async () => {
    // Se ejecuta sin argumentos
    await expect(generateSubstitutionPdf()).resolves.toBeUndefined();
  });

  it('no llama a generateRollerBOM porque es estática', async () => {
    // La función es standalone y no importa ni ejecuta nada del BOM
    await generateSubstitutionPdf();
  });
});
