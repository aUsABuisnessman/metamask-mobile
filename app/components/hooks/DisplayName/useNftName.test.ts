import { useNFTNames } from './useNftName';
import { useNftCollectionsMetadata } from './useNftCollectionsMetadata';

const KNOWN_NFT_VALUE = '0x495f947276749Ce646f68AC8c248420045cb7b5e';
const KNOWN_NFT_NAME = 'Known NFT';
const KNOWN_NFT_IMAGE = 'https://example.com/nft-image.png';
const NFT_COLLECTIONS_MOCK = {
  [KNOWN_NFT_VALUE.toLowerCase()]: {
    name: KNOWN_NFT_NAME,
    image: KNOWN_NFT_IMAGE,
    isSpam: false,
  },
};

jest.mock('./useNftCollectionsMetadata', () => ({
  useNftCollectionsMetadata: jest.fn(),
}));

describe('useNFTNames', () => {
  const useNftCollectionsMetadataMock = jest.mocked(useNftCollectionsMetadata);

  beforeAll(() => {
    useNftCollectionsMetadataMock.mockReturnValue(NFT_COLLECTIONS_MOCK);
  });

  it('returns the correct NFT name and image when not spam', () => {
    const responses = useNFTNames([{ value: KNOWN_NFT_VALUE }]);
    expect(responses[0].nftCollectionName).toEqual(KNOWN_NFT_NAME);
    expect(responses[0].nftCollectionImage).toEqual(KNOWN_NFT_IMAGE);
  });

  it('returns undefined for name and image if NFT is spam', () => {
    useNftCollectionsMetadataMock.mockReturnValue({
      [KNOWN_NFT_VALUE.toLowerCase()]: {
        name: KNOWN_NFT_NAME,
        image: KNOWN_NFT_IMAGE,
        isSpam: true,
      },
    });
    const responses = useNFTNames([{ value: KNOWN_NFT_VALUE }]);
    expect(responses[0].nftCollectionName).toBeUndefined();
    expect(responses[0].nftCollectionImage).toBeUndefined();
  });

  it('returns undefined for name and image if no NFT matched', () => {
    useNftCollectionsMetadataMock.mockReturnValue({});
    const responses = useNFTNames([{ value: KNOWN_NFT_VALUE }]);
    expect(responses[0].nftCollectionName).toBeUndefined();
    expect(responses[0].nftCollectionImage).toBeUndefined();
  });
});