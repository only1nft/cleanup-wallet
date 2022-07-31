import fs from "fs";
import {
  Keypair,
  Connection,
  Transaction,
  PublicKey,
  clusterApiUrl,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  AccountLayout,
  createBurnInstruction,
  createCloseAccountInstruction,
} from "@solana/spl-token";

const LIKE_TOKEN = new PublicKey(
  "3bRTivrVsitbmCTGtqwp7hxXPsybkjn4XLNtPsHqa3zR"
);

const keypair = Keypair.fromSecretKey(
  Buffer.from(JSON.parse(fs.readFileSync("./id.json")))
);

const conn = new Connection(
  process.env.SOLANA_RPC || clusterApiUrl("mainnet-beta"),
  {
    commitment: "confirmed",
    confirmTransactionInitialTimeout: 5 * 60 * 1000, // 5 minutes
  }
);

const res = await conn.getTokenAccountsByOwner(keypair.publicKey, {
  programId: TOKEN_PROGRAM_ID,
});

const accounts = res.value
  .map(({ account, pubkey }) => {
    const { amount, mint } = AccountLayout.decode(account.data);
    return {
      amount,
      mint,
      pubkey,
    };
  })
  .filter(({ mint }) => !LIKE_TOKEN.equals(mint));

// Burn tokens in batches
const tokensToBurn = accounts.filter(({ amount }) => amount > 0);
console.log("Tokens to burn", tokensToBurn.length);
const BURN_BATCH_SIZE = 13;
for (let i = 0; i < tokensToBurn.length; i += BURN_BATCH_SIZE) {
  const lastBlockhash = await conn.getLatestBlockhash();
  const tx = new Transaction({
    feePayer: keypair.publicKey,
    ...lastBlockhash,
  });
  const k = Math.min(i + BURN_BATCH_SIZE, tokensToBurn.length);
  for (let j = i; j < k; j++) {
    const { pubkey, amount, mint } = tokensToBurn[j];
    tx.add(createBurnInstruction(pubkey, mint, keypair.publicKey, amount));
  }
  const signature = await conn.sendTransaction(tx, [keypair]);
  console.log(`[BURN ${tx.instructions.length} TOKENS]`, signature);
  const { lastValidBlockHeight, recentBlockhash: blockhash } = tx;
  await conn
    .confirmTransaction(
      { lastValidBlockHeight, signature, blockhash },
      "confirmed"
    )
    .catch((err) => console.error(err));
}

// Close accounts in batches
console.log("Accounts to close", accounts.length);
const CLOSE_ACC_BATCH_SIZE = 27;
for (let i = 0; i < accounts.length; i += CLOSE_ACC_BATCH_SIZE) {
  const lastBlockhash = await conn.getLatestBlockhash();
  const tx = new Transaction({ feePayer: keypair.publicKey, ...lastBlockhash });
  const k = Math.min(i + CLOSE_ACC_BATCH_SIZE, accounts.length);
  for (let j = i; j < k; j++) {
    const { pubkey } = accounts[j];
    tx.add(
      createCloseAccountInstruction(
        pubkey,
        keypair.publicKey,
        keypair.publicKey
      )
    );
  }
  const signature = await conn.sendTransaction(tx, [keypair]);
  console.log(`[CLOSE ${tx.instructions.length} ACCOUNTS]`, signature);
  const { lastValidBlockHeight, recentBlockhash: blockhash } = tx;
  await conn
    .confirmTransaction(
      { lastValidBlockHeight, signature, blockhash },
      "confirmed"
    )
    .catch((err) => console.error(err));
}
