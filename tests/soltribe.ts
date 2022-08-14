import * as anchor from "@project-serum/anchor";
import * as spl from "@solana/spl-token";
import Bundlr from "@bundlr-network/client"
import { NodeBundlr  } from "@bundlr-network/client/build/node";
import { MethodsBuilderFactory, Program } from "@project-serum/anchor";
import { Soltribe } from "../target/types/soltribe";
import {
  createNewBundlrInstance,
  createBundlrFromSecretKey,
  generateCreatorPDA,
  generateCollectionPDA,
  generatePaymentVaultPDA,
  generateContentPDA,
  generateNftInfoPDA,
  ArtType,
  createMetadataJson
} from "./utils";
import { writeFile, readFileSync } from "fs";
import { assert } from "chai";
import { ASSOCIATED_TOKEN_PROGRAM_ID, createAssociatedTokenAccountInstruction } from "@solana/spl-token";

async function createTokenMint (connection: anchor.web3.Connection, mintAuthority: anchor.web3.Keypair)
: Promise<[anchor.web3.PublicKey, anchor.web3.Keypair]> {

    const airdropSignature3 = await connection.requestAirdrop(
        mintAuthority.publicKey, 2 * anchor.web3.LAMPORTS_PER_SOL);

    const latestBlockHash3 = await connection.getLatestBlockhash();
    const mintAirdropTx = await connection.confirmTransaction({
      blockhash: latestBlockHash3.blockhash,
      lastValidBlockHeight: latestBlockHash3.lastValidBlockHeight,
      signature: airdropSignature3,
    });
  
    const mintAuthorityBalance = await connection.getBalance(mintAuthority.publicKey);
  
    let mintAddress = await spl.createMint(
      connection,
      mintAuthority,
      mintAuthority.publicKey,
      null,
      0
    );
    console.log(`Token mint created with address: ${mintAddress.toBase58()}`);
  
    return [mintAddress, mintAuthority];
}


async function createAssociatedTokenAccount(program, account: anchor.web3.Keypair, mint: anchor.web3.PublicKey)
: Promise<anchor.web3.PublicKey> {
    const wallet = await spl.createAssociatedTokenAccount(
        program.provider.connection,
        account,
        mint,
        account.publicKey
    );

    console.log("Created Associated Token Account");
    return wallet;
}

async function mintTokensToWallet(wallet: anchor.web3.PublicKey, amount: number, feePayer: anchor.web3.Keypair, 
    mintAddress: anchor.web3.PublicKey, mintAuthority: anchor.web3.Keypair, program) {
    let tx = await spl.mintToChecked(
        program.provider.connection,
        feePayer,
        mintAddress,
        wallet,
        mintAuthority,
        amount * 1e0,
        0
    );

    console.log(`Minted ${amount} tokens to ${wallet}`);
}

async function airdrop(connection, destinationWallet: anchor.web3.Keypair, amount: number) {
  const airdropSignature = await connection.requestAirdrop(destinationWallet
    .publicKey, amount * anchor.web3.LAMPORTS_PER_SOL);

  const latestBlockHash = await connection.getLatestBlockhash();

  await connection.confirmTransaction({
    blockhash: latestBlockHash.blockhash,
    lastValidBlockHeight: latestBlockHash.lastValidBlockHeight,
    signature: airdropSignature,
  });
//console.log(`Airdropped ${amount} sol to ${destinationWallet.publicKey}!`);
//let balance = await connection.getBalance(destinationWallet.publicKey);
//console.log("balance: ", balance);
}


describe("soltribe", () => {
  // Configure the client to use the local cluster.
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.Soltribe as Program<Soltribe>;
  let creator1: anchor.web3.Keypair;
  let creator2: anchor.web3.Keypair;
  let buyer1: anchor.web3.Keypair;
  let buyer2: anchor.web3.Keypair;
  let buyer3: anchor.web3.Keypair;

  let tokenCreator = anchor.web3.Keypair.generate();
  console.log("token program: ", spl.TOKEN_PROGRAM_ID.toString());
  console.log("associated token program: ", ASSOCIATED_TOKEN_PROGRAM_ID.toString());
  console.log("system program: ", anchor.web3.SystemProgram.programId.toString());


  it("Is initialized!", async () => {
    await airdrop(provider.connection, tokenCreator, 2);
    let [paymentMint, mintAuthority] = await createTokenMint(provider.connection, tokenCreator);

    console.log("\n\n=> INFO!:: INITIALIZE CREATOR1'S ACCOUNT");
    creator1 = anchor.web3.Keypair.generate();
    await airdrop(provider.connection, creator1, 2);
    const [creatorAccount1, bump] = await generateCreatorPDA(program, creator1.publicKey);

    async function uploadToArweave(data, bundlr: NodeBundlr, content_type: string): Promise<string> {
      let tags = [{name: "Content-type", value: content_type}];
      let tx = bundlr.createTransaction(data, { tags: tags });
      const cost = await bundlr.getPrice(tx.size);
      await tx.sign();
      const result = await tx.upload();
      return tx.id;
    }
    
    let bundlr1 = await createBundlrFromSecretKey(creator1.secretKey);
    const username1 = "picasso";
    const description1 = "Digital art creator";
    let creatorPictureData = readFileSync("tests/content/creator1/creator1.jpeg")
    let creatorPictureCID = await uploadToArweave(creatorPictureData, bundlr1, "image/jpeg");
    console.log("creatorDisplayPictureCID: ", creatorPictureCID);

    await program.methods
      .initCreator(username1, description1, creatorPictureCID)
      .accounts({
        creator: creator1.publicKey,
        creatorAccount: creatorAccount1,
      })
      .signers([creator1])
      .rpc();
    let creatorState = await program.account.creator.fetch(creatorAccount1);
    assert.ok(creatorState.creator.equals(creator1.publicKey));
    assert.equal(creatorState.username, username1);
    assert.equal(creatorState.description, description1);
    assert.equal(creatorState.bump, bump);
    assert.equal(creatorState.collections.toNumber(), 0);
    assert.equal(creatorState.profilePictureCid, creatorPictureCID);

    console.log("\n\n=> INFO!:: INITIALIZE CREATOR1'S 1ST COLLECTION");
    let collectionTitle = "afrobeats";
    let collectionType = ArtType.Music;
    let coverArtData = readFileSync("tests/content/creator1/collection1/cover.jpeg");
    let coverArtCID = await uploadToArweave(coverArtData, bundlr1, "image/jpeg");
    console.log("collectionCoverArtCID: ", coverArtCID);

    let [collectionPDA, collectionBump] = await generateCollectionPDA(program, creator1.publicKey, 1);
    let [vaultPDA, vaultBump] = await generatePaymentVaultPDA(program, collectionPDA);

    await program.methods
      .initCollection(collectionTitle, collectionType, coverArtCID)
      .accounts({
        creator: creator1.publicKey,
        creatorAccount: creatorAccount1,
        collection: collectionPDA,
        paymentVault: vaultPDA,
        mint: paymentMint,
      })
      .signers([creator1])
      .rpc();

    let collectionState = await program.account.collection.fetch(collectionPDA);
    assert.ok(collectionState.creator.equals(creator1.publicKey));
    assert.equal(collectionState.title, collectionTitle);
    assert.equal(collectionState.artType, collectionType);
    assert.equal(collectionState.items.toNumber(), 0);
    assert.ok(collectionState.purchaseMint.equals(paymentMint));
    assert.ok(collectionState.paymentVault.equals(vaultPDA));
    assert.equal(collectionState.coverArtCid, coverArtCID);
    assert.ok(collectionState.nftInfoAccount.equals(anchor.web3.PublicKey.default));

    let updatedCreatorState = await program.account.creator.fetch(creatorAccount1);
    assert.equal(updatedCreatorState.collections.toNumber(), 1);

  
    async function uploadContent (filePath: string, title: string, creator: anchor.web3.Keypair, 
    collection: anchor.web3.PublicKey, bundlr: NodeBundlr, content_type: string) {
      let collectionState = await program.account.collection.fetch(collection);
      let initialCount = collectionState.items.toNumber();

      let [creatorPDA, _] = await generateCreatorPDA(program, creator.publicKey);
      let [contentPDA, contentBump] = await generateContentPDA(program, initialCount + 1, collection);

      let data = readFileSync(filePath);
      let contentCID = await uploadToArweave(data, bundlr, content_type);
      console.log("Content CID: ", contentCID);

      await program.methods
        .uploadContent(title, contentCID)
        .accounts({
          creator: creator.publicKey,
          creatorAccount: creatorPDA,
          collection: collection,
          content: contentPDA,
        })
        .signers([creator])
        .rpc();
      console.log("xxxxx");

      collectionState = await program.account.collection.fetch(collection);
      assert.equal(collectionState.items.toNumber(), initialCount + 1);

      let contentState = await program.account.content.fetch(contentPDA);
      assert.ok(contentState.creator.equals(creator.publicKey));
      assert.ok(contentState.collection.equals(collection));
      assert.equal(contentState.title, title);
      assert.equal(contentState.contentCid, contentCID);
    }

    console.log("\n\n=> INFO!:: UPLOADING CONTENT TO CREATOR1'S 1ST COLLECTION");
    let content1= "tests/content/creator1/collection1/music1.mp3";
    await uploadContent(content1, "1st upload", creator1, collectionPDA, bundlr1, "audio/mpeg");

    console.log("\n\n=> INFO!:: CREATOR 1 CREATES MASTER EDITION NFT");
    const TOKEN_METADATA_PROGRAM_ID = new anchor.web3.PublicKey(
      "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s");

    let masterEditionMint = anchor.web3.Keypair.generate();
    //let masterEditionMint = masterMint;
    
    let nftData = readFileSync("tests/content/creator1/creator1.jpeg");
    let coverArt = await uploadToArweave(nftData, bundlr1, "image/jpeg");

    let metadataTitle = "afroMusic";
    let metadataSymbol = "afro";
    let imageUrl = "https://www.arweave.net/" + coverArt;
    console.log("image url: ", imageUrl);

    let metadataJson = createMetadataJson(metadataTitle, metadataSymbol, imageUrl, "Cover art for my collection");
    let request = JSON.parse(metadataJson);
    let nftImageCID = await uploadToArweave(request, bundlr1, "application/json");
    let metadataUri = "https://www.arweave.net/" + nftImageCID;
    console.log("metadata Uri link: ", metadataUri);

    let mintPrice = new anchor.BN(5);
    let maxSupply = new anchor.BN(2);

    let masterEditionVault = await spl.getAssociatedTokenAddress(masterEditionMint.publicKey, collectionPDA, true);
    console.log("masterEditionVault: ", masterEditionVault.toString());
   
    const metadataAddress = (
      await anchor.web3.PublicKey.findProgramAddress(
        [
          Buffer.from("metadata"),
          TOKEN_METADATA_PROGRAM_ID.toBuffer(),
          masterEditionMint.publicKey.toBuffer()
        ],
        TOKEN_METADATA_PROGRAM_ID)
    )[0];

    const masterEditionAddress = (await anchor.web3.PublicKey.findProgramAddress([
      Buffer.from("metadata"), TOKEN_METADATA_PROGRAM_ID.toBuffer(), masterEditionMint.publicKey.toBuffer(),
      Buffer.from("edition")], TOKEN_METADATA_PROGRAM_ID)
    )[0];

    let [nftInfo, nftInfoBump] = await generateNftInfoPDA(program, collectionPDA);

    try {
    await program.methods
      .createMasterEditionNft
      (metadataTitle,metadataSymbol,metadataUri, mintPrice, maxSupply)
      .accounts({
        creator: creator1.publicKey,
        collection: collectionPDA,
        mint: masterEditionMint.publicKey,
        metadata: metadataAddress,
        masterEdition: masterEditionAddress,
        nftInfoAccount: nftInfo,
        nftVault: masterEditionVault,
        tokenMetadataProgram: TOKEN_METADATA_PROGRAM_ID,
      })
      .signers([creator1, masterEditionMint])
      .rpc()
    } catch(_err) {
      console.log(_err);
    }

    console.log("creator: ", creator1.publicKey.toString());
    console.log("masterEditionMint: ", masterEditionMint.publicKey.toString());
    console.log("vault: ", masterEditionVault.toString());
    console.log("collection: ", collectionPDA.toString());

    let nftState = await program.account.nftDetails.fetch(nftInfo);
    assert.ok(nftState.collection.equals(collectionPDA));
    assert.equal(nftState.mintPrice.toNumber(), mintPrice.toNumber());
    assert.equal(nftState.maxPrintEditions.toNumber(), maxSupply.toNumber());
    assert.equal(nftState.mintedCopies.toNumber(), 0);
    assert.ok(nftState.masterEdition.equals(masterEditionAddress));
    assert.ok(nftState.masterEditionMetadata.equals(metadataAddress));
    assert.ok(nftState.masterEditionVault.equals(masterEditionVault));
    assert.equal(nftState.title, metadataTitle);
    assert.equal(nftState.symbol, metadataSymbol);
    assert.equal(nftState.uri, metadataUri);

    collectionState = await program.account.collection.fetch(collectionPDA);
    assert.ok(collectionState.nftInfoAccount.equals(nftInfo));

    console.log("\n\n=> LOG!:: PRINT EDITIONS OF MASTER NFT");

    async function printNewEdition(buyer: anchor.web3.Keypair) {
      console.log("\n\n LOG!:: PRINTING NEW EDITION...");
      const EDITION_MARKER_BIT_SIZE = 248;

      await airdrop(provider.connection, buyer, 2);
      let newMint = anchor.web3.Keypair.generate();

      let buyerWallet = await createAssociatedTokenAccount(program, buyer, paymentMint);
      await mintTokensToWallet(buyerWallet, 10, buyer, paymentMint, mintAuthority, program);
      let buyerNftVault = await spl.getAssociatedTokenAddress(newMint.publicKey, buyer.publicKey);

      const printEditionMetadata = (
        await anchor.web3.PublicKey.findProgramAddress(
          [
            Buffer.from("metadata"),
            TOKEN_METADATA_PROGRAM_ID.toBuffer(),
            newMint.publicKey.toBuffer()
          ],
          TOKEN_METADATA_PROGRAM_ID)
      )[0];
  
      const printEdition = (await anchor.web3.PublicKey.findProgramAddress([
        Buffer.from("metadata"), TOKEN_METADATA_PROGRAM_ID.toBuffer(), newMint.publicKey.toBuffer(),
        Buffer.from("edition")], TOKEN_METADATA_PROGRAM_ID)
      )[0];

      let nftInfoState = await program.account.nftDetails.fetch(nftInfo);
      let edition = nftInfoState.mintedCopies.toNumber() + 1;
      console.log(edition);
      let editionNumber = new anchor.BN(Math.floor(edition/EDITION_MARKER_BIT_SIZE));

      const editionMarkPDA = (await anchor.web3.PublicKey.findProgramAddress([
        Buffer.from("metadata"), TOKEN_METADATA_PROGRAM_ID.toBuffer(), masterEditionMint.publicKey.toBuffer(),
        Buffer.from("edition"), Buffer.from(editionNumber.toString())], TOKEN_METADATA_PROGRAM_ID
      ))[0];
  
      await program.methods
        .purchaseNft()
        .accounts({
          buyer: buyer.publicKey,
          collection: collectionPDA,
          nftInfoAccount: nftInfo,
          paymentVault: vaultPDA,
          masterEditionVault: masterEditionVault,
          masterEdition: masterEditionAddress,
          masterEditionMetadata: metadataAddress,
          newMint: newMint.publicKey,
          newMetadata: printEditionMetadata,
          printEdition: printEdition,
          editionMarkPda: editionMarkPDA,
          buyerTokenAccount: buyerWallet,
          buyerNftVault: buyerNftVault,
          masterEditionMint: masterEditionMint.publicKey,
          tokenMetadataProgram: TOKEN_METADATA_PROGRAM_ID,
        })
        .signers([buyer, newMint]) 
        .rpc();

      console.log("buyer: ", buyer.publicKey.toString());
      console.log("buyerNftVault: ", masterEditionVault.toString());
      console.log("newEditionMint: ", newMint.publicKey.toString());
    }

    buyer1 = anchor.web3.Keypair.generate();
    await printNewEdition(buyer1);

    let buyer2 = anchor.web3.Keypair.generate();
    await printNewEdition(buyer2);

    try {
    buyer3 = anchor.web3.Keypair.generate();
    await printNewEdition(buyer3);
    chai.assert(false, "should fail because max editions printed")
    } catch(_err) {}

    let nftInfoState = await program.account.nftDetails.fetch(nftInfo);
    assert.equal(nftInfoState.mintedCopies.toNumber(), 2);
    assert.equal(nftInfoState.mintedCopies.toNumber(), nftInfoState.maxPrintEditions.toNumber());


    console.log("\n\n=> INFO!:: INITIALIZE CREATOR1'S 2ND COLLECTION");
    collectionTitle = "wolves";
    collectionType = ArtType.Photography;
    coverArtData = readFileSync("tests/content/creator1/collection2/cover.jpg");
    coverArtCID = await uploadToArweave(coverArtData, bundlr1, "image/jpeg");
    console.log("collectionCoverArtCID: ", coverArtCID);

    [collectionPDA, collectionBump] = await generateCollectionPDA(program, creator1.publicKey, 2);
    [vaultPDA, vaultBump] = await generatePaymentVaultPDA(program, collectionPDA);

    await program.methods
      .initCollection(collectionTitle, collectionType, coverArtCID)
      .accounts({
        creator: creator1.publicKey,
        creatorAccount: creatorAccount1,
        collection: collectionPDA,
        paymentVault: vaultPDA,
        mint: paymentMint,
      })
      .signers([creator1])
      .rpc();

    collectionState = await program.account.collection.fetch(collectionPDA);
    assert.ok(collectionState.creator.equals(creator1.publicKey));
    assert.equal(collectionState.title, collectionTitle);
    assert.equal(collectionState.artType, collectionType);
    assert.equal(collectionState.items.toNumber(), 0);
    assert.ok(collectionState.purchaseMint.equals(paymentMint));
    assert.ok(collectionState.paymentVault.equals(vaultPDA));
    assert.equal(collectionState.coverArtCid, coverArtCID);
    assert.ok(collectionState.nftInfoAccount.equals(anchor.web3.PublicKey.default));

    updatedCreatorState = await program.account.creator.fetch(creatorAccount1);
    assert.equal(updatedCreatorState.collections.toNumber(), 2);

    console.log("\n\n=> INFO!:: UPLOADING CONTENT TO CREATOR 1'S 2ND COLLECTION");
    content1= "tests/content/creator1/collection2/wolf1.jpg";
    let content2= "tests/content/creator1/collection2/wolf2.jpg";
    let content3= "tests/content/creator1/collection2/wolf3.jpg";
    await uploadContent(content1, "1st upload", creator1, collectionPDA, bundlr1, "image/jpeg");
    await uploadContent(content2, "2nd upload", creator1, collectionPDA, bundlr1, "image/jpeg");
    await uploadContent(content3, "3rd upload", creator1, collectionPDA, bundlr1, "image/jpeg");


    console.log("\n\n=> INFO!:: INITIALIZE CREATOR2'S ACCOUNT");
    creator2 = anchor.web3.Keypair.generate();
    await airdrop(provider.connection, creator2, 2);
    const [creatorAccount2, bump2] = await generateCreatorPDA(program, creator2.publicKey);
    
    let bundlr2 = await createBundlrFromSecretKey(creator1.secretKey);
    const username2 = "hasbullah";
    const description2 = "influencer";
    let creatorPictureData2 = "tests/content/creator2/creator2/jpeg";
    let creatorPicture2 = await uploadToArweave(creatorPictureData2, bundlr2, "image/jpeg");
    console.log("creatorDisplayPictureCID: ", creatorPicture2);

    await program.methods
      .initCreator(username2, description2, creatorPicture2)
      .accounts({
        creator: creator2.publicKey,
        creatorAccount: creatorAccount2,
      })
      .signers([creator2])
      .rpc();
    creatorState = await program.account.creator.fetch(creatorAccount2);
    assert.ok(creatorState.creator.equals(creator2.publicKey));
    assert.equal(creatorState.username, username2);
    assert.equal(creatorState.description, description2);
    assert.equal(creatorState.bump, bump2);
    assert.equal(creatorState.collections.toNumber(), 0);
    assert.equal(creatorState.profilePictureCid, creatorPicture2);

    console.log("\n\n=> INFO!:: INITIALIZE CREATOR2'S 1ST COLLECTION");
    collectionTitle = "Funny videos";
    collectionType = ArtType.Video;
    coverArtData = readFileSync("tests/content/creator2/collection1/cover.jpeg");
    coverArtCID = await uploadToArweave(coverArtData, bundlr2, "image/jpeg");
    console.log("collectionCoverArtCID: ", coverArtCID);

    [collectionPDA, collectionBump] = await generateCollectionPDA(program, creator2.publicKey, 1);
    [vaultPDA, vaultBump] = await generatePaymentVaultPDA(program, collectionPDA);

    await program.methods
      .initCollection(collectionTitle, collectionType, coverArtCID)
      .accounts({
        creator: creator2.publicKey,
        creatorAccount: creatorAccount2,
        collection: collectionPDA,
        paymentVault: vaultPDA,
        mint: paymentMint,
      })
      .signers([creator2])
      .rpc();

    collectionState = await program.account.collection.fetch(collectionPDA);
    assert.ok(collectionState.creator.equals(creator2.publicKey));
    assert.equal(collectionState.title, collectionTitle);
    assert.equal(collectionState.artType, collectionType);
    assert.equal(collectionState.items.toNumber(), 0);
    assert.ok(collectionState.purchaseMint.equals(paymentMint));
    assert.ok(collectionState.paymentVault.equals(vaultPDA));
    assert.equal(collectionState.coverArtCid, coverArtCID);
    assert.ok(collectionState.nftInfoAccount.equals(anchor.web3.PublicKey.default));

    updatedCreatorState = await program.account.creator.fetch(creatorAccount2);
    assert.equal(updatedCreatorState.collections.toNumber(), 1);

    console.log("\n\n=> INFO!:: UPLOADING CONTENT TO CREATOR2'S 1ST COLLECTION");
    content1= "tests/content/creator2/collection1/hasbullah1.mp4";
    content2= "tests/content/creator2/collection1/hasbullah2.mp4";
    await uploadContent(content1, "1st video", creator2, collectionPDA, bundlr2, "video/mp4");
    await uploadContent(content2, "2nd video", creator2, collectionPDA, bundlr2,  "video/mp4");
  });
});
