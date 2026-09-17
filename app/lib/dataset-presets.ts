import type { Dataset } from './dataset.ts';

export type DatasetPreset = {
  id: string;
  name: string;
  domain: string;
  description: string;
  target: string;
  task: 'classification' | 'regression';
  datasets: {
    Training: Dataset;
    Validation: Dataset;
    Production: Dataset;
  };
};

function generateMelanomaRows(count: number, malignantRatio: number, site: string, diameterShift: number = 0, ageMissing: boolean = false): string[][] {
  const rows: string[][] = [];
  const malignantCount = Math.max(1, Math.round(count * malignantRatio));
  for (let i = 0; i < count; i++) {
    const isMalignant = i < malignantCount;
    const asymmetry = (isMalignant ? 0.65 + (i % 7) * 0.04 : 0.18 + (i % 5) * 0.05).toFixed(2);
    const border = (isMalignant ? 0.72 + (i % 6) * 0.03 : 0.22 + (i % 8) * 0.04).toFixed(2);
    const color = (isMalignant ? 0.81 + (i % 5) * 0.03 : 0.25 + (i % 6) * 0.04).toFixed(2);
    const diameter = ((isMalignant ? 7.2 : 3.8) + diameterShift + (i % 9) * 0.3).toFixed(1);
    const age = ageMissing && i % 6 === 0 ? '' : String(38 + (i * 3) % 45);
    rows.push([
      `LES-${site}-${String(i + 1).padStart(4, '0')}`,
      asymmetry,
      border,
      color,
      diameter,
      age,
      site,
      isMalignant ? '1' : '0'
    ]);
  }
  return rows;
}

function generateFraudRows(count: number, fraudRatio: number, mobileShift: boolean = false): string[][] {
  const rows: string[][] = [];
  const fraudCount = Math.max(1, Math.round(count * fraudRatio));
  for (let i = 0; i < count; i++) {
    const isFraud = i < fraudCount;
    const amount = isFraud ? String(650 + (i * 123) % 1800) : String(18 + (i * 17) % 140);
    const merchantRisk = (isFraud ? 0.78 + (i % 5) * 0.04 : 0.12 + (i % 7) * 0.03).toFixed(2);
    const velocity = isFraud ? String(4 + (i % 5)) : String(1 + (i % 2));
    const distance = isFraud ? String(240 + (i * 47) % 600) : String(2 + (i * 3) % 25);
    const device = mobileShift && i % 2 === 0 ? 'mobile_app_v2' : i % 3 === 0 ? 'desktop_web' : 'mobile_app_v1';
    rows.push([
      `TX-${String(i + 1).padStart(5, '0')}`,
      amount,
      merchantRisk,
      velocity,
      distance,
      device,
      isFraud ? '1' : '0'
    ]);
  }
  return rows;
}

function generateSepsisRows(count: number, sepsisRatio: number, lactateShift: number = 0): string[][] {
  const rows: string[][] = [];
  const sepsisCount = Math.max(1, Math.round(count * sepsisRatio));
  for (let i = 0; i < count; i++) {
    const isSepsis = i < sepsisCount;
    const hr = String(isSepsis ? 108 + (i * 3) % 35 : 74 + (i * 2) % 22);
    const rr = String(isSepsis ? 24 + (i % 8) : 15 + (i % 5));
    const temp = (isSepsis ? 38.6 + (i % 4) * 0.3 : 36.8 + (i % 5) * 0.2).toFixed(1);
    const wbc = (isSepsis ? 14.2 + (i % 7) * 1.1 : 7.4 + (i % 6) * 0.6).toFixed(1);
    const lactate = ((isSepsis ? 3.4 : 1.1) + lactateShift + (i % 5) * 0.2).toFixed(1);
    const unit = i % 2 === 0 ? 'MICU' : 'SICU';
    rows.push([
      `PT-${String(i + 1).padStart(4, '0')}`,
      hr,
      rr,
      temp,
      wbc,
      lactate,
      unit,
      isSepsis ? '1' : '0'
    ]);
  }
  return rows;
}

export const datasetPresets: DatasetPreset[] = [
  {
    id: 'melanoma-dermoscopy',
    name: 'Melanoma Dermoscopy (Site Shift & Imbalance)',
    domain: 'Clinical Oncology',
    description: 'Severe 5.8% class imbalance with site-to-site distribution drift and missing clinical metadata.',
    target: 'y_true',
    task: 'classification',
    datasets: {
      Training: {
        name: 'melanoma_siteA_train.csv',
        headers: ['lesion_id', 'asymmetry', 'border_irregularity', 'color_variegation', 'diameter_mm', 'patient_age', 'clinic_site', 'y_true'],
        rows: generateMelanomaRows(100, 0.05, 'SiteA')
      },
      Validation: {
        name: 'melanoma_siteA_val.csv',
        headers: ['lesion_id', 'asymmetry', 'border_irregularity', 'color_variegation', 'diameter_mm', 'patient_age', 'clinic_site', 'y_true'],
        rows: generateMelanomaRows(50, 0.06, 'SiteA')
      },
      Production: {
        name: 'melanoma_siteB_stream.csv',
        headers: ['lesion_id', 'asymmetry', 'border_irregularity', 'color_variegation', 'diameter_mm', 'patient_age', 'clinic_site', 'y_true'],
        rows: generateMelanomaRows(60, 0.08, 'SiteB', 1.4, true)
      }
    }
  },
  {
    id: 'fraud-detection',
    name: 'Financial Fraud (Extreme 1.5% Imbalance)',
    domain: 'FinTech & Security',
    description: 'Extreme transaction asymmetry where 98.5% top-line accuracy masks 70%+ of financial crimes.',
    target: 'y_true',
    task: 'classification',
    datasets: {
      Training: {
        name: 'fraud_historical_train.csv',
        headers: ['tx_id', 'amount_usd', 'merchant_risk_score', 'velocity_1h', 'distance_from_home_km', 'device_type', 'y_true'],
        rows: generateFraudRows(100, 0.02)
      },
      Validation: {
        name: 'fraud_holdout_val.csv',
        headers: ['tx_id', 'amount_usd', 'merchant_risk_score', 'velocity_1h', 'distance_from_home_km', 'device_type', 'y_true'],
        rows: generateFraudRows(50, 0.02)
      },
      Production: {
        name: 'fraud_gateway_prod.csv',
        headers: ['tx_id', 'amount_usd', 'merchant_risk_score', 'velocity_1h', 'distance_from_home_km', 'device_type', 'y_true'],
        rows: generateFraudRows(60, 0.03, true)
      }
    }
  },
  {
    id: 'sepsis-icu',
    name: 'ICU Sepsis Triage (Physiological Drift)',
    domain: 'Critical Care Medicine',
    description: 'Time-sensitive vital signs monitoring with physiological shift and high-cost false negatives.',
    target: 'y_true',
    task: 'classification',
    datasets: {
      Training: {
        name: 'sepsis_icu_cohort_train.csv',
        headers: ['patient_id', 'heart_rate', 'respiratory_rate', 'temperature_c', 'wbc_count', 'serum_lactate', 'icu_unit', 'y_true'],
        rows: generateSepsisRows(100, 0.08)
      },
      Validation: {
        name: 'sepsis_icu_cohort_val.csv',
        headers: ['patient_id', 'heart_rate', 'respiratory_rate', 'temperature_c', 'wbc_count', 'serum_lactate', 'icu_unit', 'y_true'],
        rows: generateSepsisRows(50, 0.08)
      },
      Production: {
        name: 'sepsis_ed_stream_prod.csv',
        headers: ['patient_id', 'heart_rate', 'respiratory_rate', 'temperature_c', 'wbc_count', 'serum_lactate', 'icu_unit', 'y_true'],
        rows: generateSepsisRows(60, 0.12, 0.8)
      }
    }
  }
];
