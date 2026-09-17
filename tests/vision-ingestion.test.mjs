import test from 'node:test';
import assert from 'node:assert/strict';
import { ingestVisionDataset, getFileStem } from '../app/lib/vision/ingestion.ts';

test('getFileStem extracts filename stem correctly', () => {
  assert.equal(getFileStem('photo.jpg'), 'photo');
  assert.equal(getFileStem('path/to/sample_001.png'), 'sample_001');
  assert.equal(getFileStem('archive.tar.gz'), 'archive.tar');
  assert.equal(getFileStem('no_extension'), 'no_extension');
});

test('ingestVisionDataset parses predictions and handles metadata-only mode gracefully', () => {
  const csv = `image_id,y_true,y_pred,y_probability,split,site,device
img_001,1,0,0.22,train,hospital_A,scanner_X
img_002,0,0,0.05,val,hospital_A,scanner_Y
img_003,1,1,0.91,production,hospital_B,scanner_X`;

  const { predictions, audit } = ingestVisionDataset(csv);

  assert.equal(predictions.length, 3);
  assert.equal(audit.isMetadataOnly, true);
  assert.equal(audit.matchedImagesCount, 0);
  assert.equal(audit.splitDistribution.train, 1);
  assert.equal(audit.splitDistribution.val, 1);
  assert.equal(audit.splitDistribution.production, 1);
  assert.ok(audit.unavailableDiagnostics.length > 0);

  assert.equal(predictions[0].imageId, 'img_001');
  assert.equal(predictions[0].yTrue, 1);
  assert.equal(predictions[0].yPred, 0);
  assert.equal(predictions[0].site, 'hospital_A');
});

test('ingestVisionDataset matches image files by stem and reports unmatched files', () => {
  const csv = `image_id,y_true,y_pred,y_probability
img_001,1,1,0.95
img_002,0,0,0.10`;

  // Dummy blob items with filenames
  const dummyBlob1 = new Blob(['123'], { type: 'image/jpeg' });
  const dummyBlob2 = new Blob(['456'], { type: 'image/jpeg' });
  const dummyBlobExtra = new Blob(['789'], { type: 'image/jpeg' });

  const files = [dummyBlob1, dummyBlob2, dummyBlobExtra];
  const fileNames = ['img_001.jpg', 'img_002.png', 'unmatched_extra.jpg'];

  const { predictions, audit } = ingestVisionDataset(csv, files, fileNames);

  assert.equal(predictions.length, 2);
  assert.equal(audit.isMetadataOnly, false);
  assert.equal(audit.matchedImagesCount, 2);
  assert.equal(audit.unmatchedFilesCount, 1);
  assert.equal(audit.unmatchedFileNames[0], 'unmatched_extra.jpg');
  assert.equal(audit.missingImagesCount, 0);
});

test('ingestVisionDataset throws actionable error when required columns are missing', () => {
  const badCsv = `id,some_metric,score
1,0.5,0.8`;

  assert.throws(
    () => ingestVisionDataset(badCsv),
    /Missing required column/
  );
});
