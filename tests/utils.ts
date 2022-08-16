import Bundlr from "@bundlr-network/client"
import * as fs from "fs"
import * as anchor from '@project-serum/anchor';
import { Soltribe } from "../target/types/soltribe";
//import * as spl from '@solana/spl-token';

type ProgramType = anchor.Program<Soltribe>;

export enum ArtType {
    Writing = 1,
    Video = 2,
    Music = 3,
    Painting = 4,
    Design  = 5,
    Photography = 6,
    Adult = 7,
  };

export const createNewBundlrInstance = async () => {
    const jwk = JSON.parse(fs.readFileSync("tests/keypairs/solana.json").toString());
    const bundlr = new Bundlr("https://devnet.bundlr.network", "solana", jwk, { providerUrl: "https://api.devnet.solana.com" });
    console.log("Created new Bundlr instance");
    let response = await bundlr.fund(100_000_000);
    console.log("Funded bundlr wallet with 100_000_000 units");
    let balance = await bundlr.getBalance(bundlr.address);
    console.log("Bundlr balance: ", balance.toNumber());
    return bundlr;
}

export const createBundlrFromSecretKey = async (secretKey) => {
    const bundlr = new Bundlr("https://devnet.bundlr.network", "solana", secretKey, { providerUrl: "https://api.devnet.solana.com" });
    console.log("Created new Bundlr instance");
    let response = await bundlr.fund(100_000_000);
    console.log("Funded bundlr wallet with 100_000_000 units");
    return bundlr;
}


export const generateCreatorPDA = async (program: ProgramType, creator: anchor.web3.PublicKey) 
:Promise<[anchor.web3.PublicKey, number]> => {
    let [pda, bump] = await anchor.web3.PublicKey.findProgramAddress([Buffer.from(anchor.utils.bytes.utf8.encode("creator")),
        creator.toBuffer()], program.programId);

    return [pda, bump];
}

export const generateCollectionPDA = async (program: ProgramType, creator: anchor.web3.PublicKey, id: number) 
:Promise<[anchor.web3.PublicKey, number]> => {
    let [pda, bump] = await anchor.web3.PublicKey.findProgramAddress([Buffer.from(anchor.utils.bytes.utf8.encode("collection")),
        creator.toBuffer(), new anchor.BN(id).toBuffer('le', 8)], program.programId);

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
    let [pda, bump] = await anchor.web3.PublicKey.findProgramAddress([Buffer.from(anchor.utils.bytes.utf8.encode("content")),
        collection.toBuffer(), new anchor.BN(id).toBuffer('le', 8)], program.programId);

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


export const createMetadataJson = (name: string, symbol: string, link: string, description: string) => {
    let json: String = `{
        "name": "${name}",
        "symbol": "${symbol}",
        "description": "${description}",
        "seller_fee_basis_points": 1,
        "external_url": "",
        "edition": "",
        "background_color": "000000",
        "image": "${link}"
    }`;

    return JSON.stringify(json);
};