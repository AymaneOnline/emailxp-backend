const domainAuthService = require('../services/domainAuthService');
const DomainAuthentication = require('../models/DomainAuthentication');

jest.mock('../models/DomainAuthentication', () => ({
  findById: jest.fn(),
  findByIdAndDelete: jest.fn(),
}));

describe('domainAuthService.deleteDomain ownership checks', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  test('deletes when organization matches', async () => {
    const domain = { _id: '1', organization: { toString: () => 'org1' }, user: null, isPrimary: false, domain: 'a.com' };
    DomainAuthentication.findById.mockResolvedValue(domain);
    DomainAuthentication.findByIdAndDelete.mockResolvedValue(true);

    await expect(domainAuthService.deleteDomain('1', 'user1', 'org1')).resolves.toEqual({ success: true, domain: 'a.com' });
    expect(DomainAuthentication.findByIdAndDelete).toHaveBeenCalledWith('1');
  });

  test('throws when organization mismatches', async () => {
    const domain = { _id: '2', organization: { toString: () => 'org2' }, user: null, isPrimary: false };
    DomainAuthentication.findById.mockResolvedValue(domain);

    await expect(domainAuthService.deleteDomain('2', 'user1', 'org1')).rejects.toThrow('Unauthorized to delete this domain');
  });

  test('throws when user mismatches', async () => {
    const domain = { _id: '3', organization: null, user: { toString: () => 'user2' }, isPrimary: false };
    DomainAuthentication.findById.mockResolvedValue(domain);

    await expect(domainAuthService.deleteDomain('3', 'user1', null)).rejects.toThrow('Unauthorized to delete this domain');
  });
});
