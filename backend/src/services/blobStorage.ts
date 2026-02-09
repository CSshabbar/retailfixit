import {
  BlobServiceClient,
  ContainerClient,
  StorageSharedKeyCredential,
  generateBlobSASQueryParameters,
  BlobSASPermissions,
} from '@azure/storage-blob';
import { config } from '../config.js';

let containerClient: ContainerClient | null = null;
let sharedKeyCredential: StorageSharedKeyCredential | null = null;

/** Lazily initialises the blob container (creates if not exists) */
async function getContainer(): Promise<ContainerClient> {
  if (containerClient) return containerClient;

  const blobService = BlobServiceClient.fromConnectionString(config.storage.connectionString);
  containerClient = blobService.getContainerClient(config.storage.containerName);
  await containerClient.createIfNotExists();

  // Extract credential for SAS generation
  const accountName = config.storage.connectionString.match(/AccountName=([^;]+)/)?.[1];
  const accountKey = config.storage.connectionString.match(/AccountKey=([^;]+)/)?.[1];
  if (accountName && accountKey) {
    sharedKeyCredential = new StorageSharedKeyCredential(accountName, accountKey);
  }

  return containerClient;
}

/** Uploads a buffer to blob storage and returns the blob name */
export async function uploadBlob(
  blobName: string,
  buffer: Buffer,
  mimeType: string,
): Promise<void> {
  const container = await getContainer();
  const blockBlob = container.getBlockBlobClient(blobName);
  await blockBlob.uploadData(buffer, {
    blobHTTPHeaders: { blobContentType: mimeType },
  });
}

/** Deletes a blob by its full name */
export async function deleteBlobByName(blobName: string): Promise<void> {
  const container = await getContainer();
  const blockBlob = container.getBlockBlobClient(blobName);
  await blockBlob.deleteIfExists();
}

/** Generates a time-limited read-only SAS URL for a blob */
export async function generateSasUrl(blobName: string): Promise<string> {
  const container = await getContainer();

  if (!sharedKeyCredential) {
    throw new Error('Storage shared key credential not available');
  }

  const blockBlob = container.getBlockBlobClient(blobName);

  const startsOn = new Date();
  const expiresOn = new Date(startsOn.getTime() + 60 * 60 * 1000); // 1 hour

  const sas = generateBlobSASQueryParameters(
    {
      containerName: config.storage.containerName,
      blobName,
      permissions: BlobSASPermissions.parse('r'),
      startsOn,
      expiresOn,
    },
    sharedKeyCredential,
  ).toString();

  return `${blockBlob.url}?${sas}`;
}
