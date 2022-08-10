import Bundlr from "@bundlr-network/client"
import * as fs from "fs"
import * as anchor from '@project-serum/anchor';
import { Solomon } from "../target/types/solomon";
//import * as spl from '@solana/spl-token';

type ProgramType = anchor.Program<Solomon>;

export const createNewBundlrInstance = async () => {
    //const jwk = JSON.parse(fs.readFileSync("arweave_keypair.json").toString());
    //const bundlr = new Bundlr("http://node1.bundlr.network", "arweave", jwk);
    const jwk = JSON.parse(fs.readFileSync("tests/keypairs/solana.json").toString());
    const bundlr = new Bundlr("https://devnet.bundlr.network", "solana", jwk, { providerUrl: "https://api.devnet.solana.com" });
    console.log("log::[] Created New Bundlr instance")
    return bundlr;
}

export const airdropToWallet = async (connection: anchor.web3.Connection, destination: anchor.web3.PublicKey, amount) => {
    const airdropSignature = await connection.requestAirdrop(destination, amount * anchor.web3.LAMPORTS_PER_SOL);

    const latestBlockHash = await connection.getLatestBlockhash();
    await connection.confirmTransaction({
      blockhash: latestBlockHash.blockhash,
      lastValidBlockHeight: latestBlockHash.lastValidBlockHeight,
      signature: airdropSignature,
    });
    console.log(`log::[] Airdropped ${amount} sol to ${destination}!`);
}

export const generateCreatorPDA = async (program: ProgramType, username: string) 
:Promise<[anchor.web3.PublicKey, number]> => {
    let [pda, bump] = await anchor.web3.PublicKey.findProgramAddress([Buffer.from(anchor.utils.bytes.utf8.encode("creator")),
        Buffer.from(anchor.utils.bytes.utf8.encode(username))], program.programId);

    return [pda, bump];
}

export const generateCollectionPDA = async (program: ProgramType, creator: anchor.web3.PublicKey, title: string) 
:Promise<[anchor.web3.PublicKey, number]> => {
    let [pda, bump] = await anchor.web3.PublicKey.findProgramAddress([Buffer.from(anchor.utils.bytes.utf8.encode("collection")),
        creator.toBuffer(), Buffer.from(anchor.utils.bytes.utf8.encode(title))], program.programId);

    return [pda, bump];
}

export const generatePaymentVaultPDA = async (program: ProgramType, collection: anchor.web3.PublicKey) 
:Promise<[anchor.web3.PublicKey, number]> => {
    let [pda, bump] = await anchor.web3.PublicKey.findProgramAddress([Buffer.from(anchor.utils.bytes.utf8.encode("vault")),
        collection.toBuffer()], program.programId);

    return [pda, bump];
}

export const generateContentPDA = async(program: ProgramType , id: number, collection: anchor.web3.PublicKey)
:Promise<[anchor.web3.PublicKey, number]> => {
    let [pda, bump] = await anchor.web3.PublicKey.findProgramAddress(
        [new anchor.BN(id).toBuffer('le', 8), collection.toBuffer()], program.programId
    );

    return [pda, bump];
}

export const generateNftInfoPDA = async(program: ProgramType, collection: anchor.web3.PublicKey)
:Promise<[anchor.web3.PublicKey, number]> => {
    let [pda, bump] = await anchor.web3.PublicKey.findProgramAddress(
        [Buffer.from(anchor.utils.bytes.utf8.encode("nft-info")), collection.toBuffer()],
        program.programId
    )

    return [pda, bump];
}