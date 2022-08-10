import * as anchor from "@project-serum/anchor";
import { Program } from "@project-serum/anchor";
import { Solomon } from "../target/types/solomon";
import {
  createNewBundlrInstance,
  airdropToWallet,
  generateCreatorPDA,
  generateCollectionPDA,
  generatePaymentVaultPDA,
  generateContentPDA,
  generateNftInfoPDA

} from "./utils";

describe("solomon", () => {
  // Configure the client to use the local cluster.
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.Solomon as Program<Solomon>;

  it("Is initialized!", async () => {
    // Initialize bundlr
    let bundlr = await createNewBundlrInstance();
    let response = await bundlr.fund(5);
    console.log("log::[] Funded bundlr wallet with 5 units");

    // Init creator1 account
    let creator1 = anchor.web3.Keypair.generate();
    await airdropToWallet(provider.connection, creator1.publicKey, 5);
    let username1 = "picasso";
    let description1 = "Digital art creator";
    let creator1Account = await generateCreatorPDA(program, username1);

    await program.methods
      .initCreator(username1, description1)
      .accounts({
        creator: creator1.publicKey,
        creatorAccount: creator1Account,
      })
      .signers([creator1])
      .rpc();
    

  });
});
