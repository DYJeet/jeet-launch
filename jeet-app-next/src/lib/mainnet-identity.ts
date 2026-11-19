import { address, isOffCurveAddress } from '@solana/kit';

export const TREASURY = address('HVx69FZYW1bBkyK3RaVLNhhAPETZK9tA7E3CrHjrJ1wP');
export const SYSTEM = address('11111111111111111111111111111111');
const reserved = new Set([
  SYSTEM, TREASURY, '2iXtA8oeZqUU5pofxK971TCEvFGfems2AcDRaZHKD2pQ',
  '7QhXSnj7igy9HX6n1i3bnuc2SUbMTRWZEouGZKcy9d31', '8zhREvLzbAGnMPrmQv9nQ4dzvgmq2unFAsLPaX9ZS3zo',
  'Fs39Nso7hzYw84u75RzSLTUE9YrD8zgkk1bLfgAiX72D', 'DQeELacwEfej1r9g5pt4eQQcetxe3TAgVGD9RJSutJNW',
  'BAZK4s9BBN3x4XGhjG3tj4P6jGky8cnNHBUdMsoHGFyg', '13TckZDu8H8VAXSmkfGqVKMwbeWoJsrsBSk5i1KkA1Uf',
  '9m9k7oUP2EpVhgPXtrAsFTYE6WY6kaq8w67QvkWKjx9b', 'CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C',
  'DNXgeM9EiiaAbaWvwjHj9fQQLAX5ZsfHyvmYUNRAdNC8', 'metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s',
  '36VASLSKLFD2KokjXG7V28veZvXEsyHRKefLonPaAKzv', '5oEzAP4izB65uRm2yDAEf9oALGwHpWkDfyKb8zBY3euC',
]);
export function dedicatedAddress(value: string) {
  const key = address(value);
  if (reserved.has(key)) throw Error('A dedicated Mainnet address is required.');
  return key;
}

export function dedicatedSigner(value: string) {
  const signer = dedicatedAddress(value);
  if (isOffCurveAddress(signer)) throw Error('A dedicated Mainnet Ed25519 signer is required.');
  return signer;
}
