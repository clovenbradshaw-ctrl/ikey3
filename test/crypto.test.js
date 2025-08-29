const assert = require('assert');
const { ThreeLayerEncryption } = require('../app.js');

(async () => {
  globalThis.self = globalThis;
  const pin = '123456';
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key1 = await ThreeLayerEncryption.derivePinKey(pin, salt);
  const key2 = await ThreeLayerEncryption.derivePinKey(pin, salt);
  assert.strictEqual(key1, key2, 'derivePinKey should be deterministic');

  const secret = { foo: 'bar', baz: 42 };
  const enc = await ThreeLayerEncryption.encrypt(secret, key1);
  const dec = await ThreeLayerEncryption.decrypt(enc, key1);
  assert.deepStrictEqual(dec, secret, 'encrypt/decrypt round trip');

  const record = await ThreeLayerEncryption.buildRecord(secret, { private: 's' }, { docs: [] }, pin);
  const pub = await ThreeLayerEncryption.unlockPublic(record.storedData, record.qrKey);
  assert.deepStrictEqual(pub, secret, 'unlockPublic returns original data');
  const priv = await ThreeLayerEncryption.unlockPrivate(record.storedData, pin);
  assert.deepStrictEqual(priv, { private: 's' }, 'unlockPrivate returns original data');
  const vault = await ThreeLayerEncryption.unlockVault(record.storedData, record.qrKey);
  assert.deepStrictEqual(vault, { docs: [] }, 'unlockVault returns original data');

  console.log('All crypto tests passed');
})();
