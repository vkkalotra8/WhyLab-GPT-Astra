import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeEvidence } from '../app/lib/evidence.ts';
import {
  buildCsvDecisionBasis,
  generateDecisionAuditReport,
  isMissingCell,
  classifySentinel,
} from '../app/lib/decision-basis.ts';

test('isMissingCell and classifySentinel detect all standard null sentinels', () => {
  assert.equal(isMissingCell(''), true);
  assert.equal(isMissingCell('   '), true);
  assert.equal(isMissingCell('null'), true);
  assert.equal(isMissingCell('NULL'), true);
  assert.equal(isMissingCell('NaN'), true);
  assert.equal(isMissingCell('nan'), true);
  assert.equal(isMissingCell('na'), true);
  assert.equal(isMissingCell('NA'), true);
  assert.equal(isMissingCell('n/a'), true);
  assert.equal(isMissingCell('N/A'), true);

  // Non-missing values
  assert.equal(isMissingCell('0'), false);
  assert.equal(isMissingCell('0.0'), false);
  assert.equal(isMissingCell('false'), false);
  assert.equal(isMissingCell('valid_string'), false);

  assert.equal(classifySentinel(''), 'empty string ""');
  assert.equal(classifySentinel('NaN'), 'NaN / nan');
  assert.equal(classifySentinel('null'), 'null / NULL');
  assert.equal(classifySentinel('NA'), 'NA / na');
  assert.equal(classifySentinel('n/a'), 'N/A / n/a');
});

test('buildCsvDecisionBasis accurately calculates 160 / 1620 missing cells and reasons', () => {
  // Construct a synthetic 180-row, 9-column dataset matching the user's screenshot
  const headers = ['id', 'f1', 'f2', 'f3', 'f4', 'f5', 'f6', 'f7', 'target'];
  const rows = [];

  // Generate 180 rows
  // Exactly 160 cells missing across columns f1 and f2 (80 each)
  for (let i = 0; i < 180; i++) {
    const isTargetZero = i < 166; // 166 zeros, 14 ones -> 92.2% class 0
    const row = [
      String(i + 1),
      i < 80 ? '' : '1.25', // 80 empty strings
      i < 80 ? 'NaN' : '3.45', // 80 NaNs
      '0.5',
      '0.8',
      '1.1',
      '2.2',
      '3.3',
      isTargetZero ? '0' : '1',
    ];
    rows.push(row);
  }

  const basis = buildCsvDecisionBasis(headers, rows, 'whylab_case_train.csv');

  // Verify core dimensions & formula
  assert.equal(basis.totalRecords, 180);
  assert.equal(basis.totalFieldsOrCells, 1620); // 180 * 9
  assert.ok(basis.missingCells);
  assert.equal(basis.missingCells.totalMissing, 160);
  assert.equal(basis.missingCells.totalCells, 1620);
  assert.equal(basis.missingCells.columnBreakdown.length, 9);

  // Check column f1 (empty strings)
  const colF1 = basis.missingCells.columnBreakdown.find(c => c.name === 'f1');
  assert.ok(colF1);
  assert.equal(colF1.missingCount, 80);
  assert.equal(colF1.presentCount, 100);
  assert.ok(colF1.sentinelsDetected.some(s => s.sentinel.includes('empty string')));
  assert.ok(colF1.sampleMissingLineNumbers.length > 0);
  assert.equal(colF1.sampleMissingLineNumbers[0], 2); // row 1 in file is CSV line 2

  // Check column f2 (NaN sentinels)
  const colF2 = basis.missingCells.columnBreakdown.find(c => c.name === 'f2');
  assert.ok(colF2);
  assert.equal(colF2.missingCount, 80);
  assert.ok(colF2.sentinelsDetected.some(s => s.sentinel.includes('NaN')));

  // Check target balance (92.2% class 0)
  assert.ok(basis.targetBalance);
  assert.equal(basis.targetBalance.targetColumn, 'target');
  assert.equal(basis.targetBalance.dominantClass, '0');
  assert.equal(basis.targetBalance.isImbalanced, true);
  assert.match(basis.targetBalance.imbalanceRuleRationale, /70.0%/);

  // Check repeated rows (0 repeated rows)
  assert.ok(basis.repeatedRows);
  assert.equal(basis.repeatedRows.repeatedCount, 0);
  assert.equal(basis.repeatedRows.uniqueRows, 180);
});

test('analyzeEvidence on CSV populates decisionBasis and metrics seamlessly', () => {
  const csv = [
    'f1,f2,target',
    '1,,0',
    '2,NaN,0',
    '3,4,0',
    '5,6,1',
  ].join('\n');

  const evidence = analyzeEvidence(csv, 'test_dataset.csv');
  assert.equal(evidence.rows, 4);
  assert.equal(evidence.columns, 3);
  assert.ok(evidence.metrics.some(m => m.label === 'Missing cells' && m.value === '2 / 12'));
  assert.ok(evidence.decisionBasis);
  assert.equal(evidence.decisionBasis.missingCells?.totalMissing, 2);
  assert.equal(evidence.decisionBasis.missingCells?.totalCells, 12);
  assert.equal(evidence.decisionBasis.repeatedRows?.repeatedCount, 0);
});

test('generateDecisionAuditReport creates detailed TXT and MD reports with provenance', () => {
  const csv = [
    'f1,f2,target',
    '1,,0',
    '2,null,0',
    '3,val,0',
    '4,val,1',
  ].join('\n');

  const evidence = analyzeEvidence(csv, 'whylab_case_train.csv');

  // Generate TXT report
  const txtReport = generateDecisionAuditReport(evidence, 'txt');
  assert.match(txtReport, /WHYLAB AI\/ML INCIDENT INVESTIGATION/);
  assert.match(txtReport, /File Analyzed\s+:\s+whylab_case_train\.csv/);
  assert.match(txtReport, /DECISION BASIS: MISSING CELLS/);
  assert.match(txtReport, /Total Cell Capacity\s+:\s+4 rows × 3 columns = 12 cells/);
  assert.match(txtReport, /Empty string \/ blank whitespace/);
  assert.match(txtReport, /DECISION BASIS: REPEATED ROWS/);
  assert.match(txtReport, /DECISION BASIS: TARGET & CLASS IMBALANCE/);

  // Generate MD report
  const mdReport = generateDecisionAuditReport(evidence, 'md');
  assert.match(mdReport, /## 1\. Executive Summary/);
  assert.match(mdReport, /## 2\. Decision Basis: Missing Cells/);
  assert.match(mdReport, /\| Column Name \| Total Rows \| Missing Cells \|/);
});

test('buildLogDecisionBasis tracks regex matches, line numbers, and distribution shift gap', () => {
  const logText = [
    '2026-09-12T14:10:01Z INFO train_accuracy=0.984 train_loss=0.052',
    '2026-09-12T14:10:01Z INFO val_accuracy=0.956 val_loss=0.121',
    '2026-09-12T14:10:02Z WARN production_accuracy=0.641 production_loss=0.862',
  ].join('\n');

  const evidence = analyzeEvidence(logText, 'whylab_case_experiment.log');
  assert.ok(evidence.decisionBasis);
  assert.equal(evidence.decisionBasis.formatDetected, 'Training logs');
  assert.ok(evidence.decisionBasis.metricExtractions);
  assert.ok(evidence.decisionBasis.metricExtractions.length >= 4);

  // Check that distribution shift gap (95.6% - 64.1% = 31.5% >= 10%) was recorded
  const shift = evidence.decisionBasis.hypothesesTriggers?.find(h => h.hypothesisTitle.includes('distribution shift'));
  assert.ok(shift);
  assert.equal(shift.outcome, 'Triggered');
  assert.match(shift.evaluatedExpression, /31\.5%/);
});

test('buildVisionDecisionBasis and generateVisionDecisionAuditReport produce complete provenance', async () => {
  const { buildVisionDecisionBasis, generateVisionDecisionAuditReport } = await import('../app/lib/decision-basis.ts');

  const mockPredictions = [
    { imageId: 'img_1', yTrue: 1, yPred: 1, yProbability: 0.9, split: 'train' },
    { imageId: 'img_2', yTrue: 0, yPred: 0, yProbability: 0.1, split: 'val' },
    { imageId: 'img_3', yTrue: 1, yPred: 0, yProbability: 0.2, split: 'production' }
  ];

  const mockProfiles = [
    {
      imageId: 'img_1',
      width: 512,
      height: 512,
      aspectRatio: 1,
      meanLuminance: 128,
      stdLuminance: 32,
      rmsContrast: 0.25,
      meanSaturation: 0.4,
      colorfulness: 45.2,
      sharpness: 210.5,
      edgeDensity: 0.08,
      noiseEstimate: 4.1,
      clippedHighlights: 0.01,
      crushedBlacks: 0.01,
      dominantHue: 40,
      jpegQualityEstimate: 92,
      dHash: 'a1b2c3d4e5f60718',
      aHash: '0102030405060708'
    }
  ];

  const mockLeakage = {
    totalPairsChecked: 3,
    duplicatePairs: [
      {
        imageAId: 'img_2',
        imageBId: 'img_1',
        splitA: 'val',
        splitB: 'train',
        hammingDistance: 1,
        isCrossSplitLeakage: true
      }
    ],
    leakedImageIds: new Set(['img_2']),
    leakedCount: 1,
    cleanCount: 2,
    accuracyLeaked: 1.0,
    accuracyClean: 0.5,
    accuracyGap: 0.5,
    confidenceInterval95: [0.15, 0.85],
    severity: 'critical'
  };

  const mockSlices = [
    {
      dimension: 'site',
      sliceValue: 'site_B',
      sampleCount: 20,
      errorCount: 12,
      errorRate: 0.6,
      wilsonCi: [0.38, 0.79],
      excessError: 0.25,
      impactScore: 5.0
    }
  ];

  const mockConcepts = [
    {
      concept: {
        id: 'c_watermark',
        name: 'Corner Scale Ruler / Watermark',
        rubric: 'Millimeter ruler present in corner',
        positiveExampleIds: ['img_1'],
        negativeExampleIds: ['img_2'],
        whyPlausible: 'Dermatologist ruler',
        expectedDirection: 'higher_error'
      },
      verdict: 'supported',
      cohenKappa: 0.92,
      isUnreliable: false,
      withConceptCount: 40,
      withConceptErrorRate: 0.78,
      withoutConceptCount: 120,
      withoutConceptErrorRate: 0.22,
      differencePp: 56.0,
      wilsonCiPp: [38.2, 73.8],
      rawPValue: 0.0002,
      adjustedPValue: 0.0008,
      explanation: 'Statistically significant error elevation surviving stratification.',
      stratificationCheck: { survivesSiteStratification: true }
    }
  ];

  const basis = buildVisionDecisionBasis(
    mockPredictions,
    mockProfiles,
    mockLeakage,
    mockSlices,
    mockConcepts,
    40,
    160,
    'Kaggle ISIC 2024 / Vision Benchmark'
  );

  assert.equal(basis.totalImages, 3);
  assert.equal(basis.leakage.leakedCount, 1);
  assert.equal(basis.leakage.accuracyGapPp, 50.0);
  assert.equal(basis.conceptFalsification.concepts[0].verdict, 'supported');

  // Verify text audit export
  const txt = generateVisionDecisionAuditReport(basis, 'txt');
  assert.match(txt, /WHYLAB VISION — COMPUTER VISION DECISION BASIS & PROVENANCE AUDIT/);
  assert.match(txt, /ON WHAT BASIS WERE NEAR-DUPLICATES FLAGGED\?/);
  assert.match(txt, /ON WHAT BASIS WAS ACCURACY INFLATION PROVEN\?/);
  assert.match(txt, /Hamming distance <= 6 bits/);
  assert.match(txt, /Laplacian Sharpness/);
  assert.match(txt, /Corner Scale Ruler \/ Watermark/);

  // Verify markdown audit export
  const md = generateVisionDecisionAuditReport(basis, 'md');
  assert.match(md, /## 2\. Decision Basis: Near-Duplicate Leakage/);
  assert.match(md, /## 4\. Decision Basis: Empirical Concept Falsification Loop/);
});
