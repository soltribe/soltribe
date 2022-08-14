use anchor_lang:: { 
    prelude::*, 
    system_program,
    solana_program::{program::{invoke, invoke_signed}, clock},
};
use anchor_spl::{ 
    token::{Token, Mint, TokenAccount, Transfer},
    associated_token::AssociatedToken
};

use mpl_token_metadata::{instruction as mpl_instruction, ID as TOKEN_METADATA_PROGRAM_ID};

declare_id!("2BUzF1GbkamgZr8bgsPMXwETHJp7uBiVf3B22BXpWFYn");

pub const EDITION_MARKER_BIT_SIZE: u64 = 248;
pub const PREFIX: &str = "metadata";
pub const EDITION: &str = "edition";

#[program]
pub mod soltribe {
    use super::*;

    pub fn init_creator(ctx: Context<InitCreator>, username: String, description: String, picture_cid: String) -> Result<()> {
        require!(username.len() < Creator::MAX_USERNAME_LEN, 
            SolomonError::MaxUsernameLengthExceeded);
        require!(description.len() < Creator::MAX_DESCRIPTION_LEN, 
            SolomonError::MaxDescriptionLengthExceeded);
        require!(picture_cid.len() < Creator::CID_LEN, SolomonError::MaxCIDLengthExceeded);

        msg!("creator_account_key: {}", ctx.accounts.creator_account.key());

        let creator = &mut ctx.accounts.creator_account;
        let clock = clock::Clock::get().unwrap();

        creator.creator = ctx.accounts.creator.key();
        creator.username = username;
        creator.join_date = clock.unix_timestamp;
        creator.description = description;
        creator.bump = *ctx.bumps.get("creator_account").unwrap();
        creator.collections = 0;
        creator.profile_picture_cid = picture_cid;
        Ok(())
    }

    pub fn init_collection(ctx: Context<CreateCollection>, title: String, art_type: u8, art_cid: String) -> Result<()> {
        require!(title.len() <= Collection::MAX_TITLE_LEN, SolomonError::MaxTitleLengthExceeded);
        require!(art_cid.len() <= Content::CID_LEN, SolomonError::MaxCIDLengthExceeded);
        _ = ArtType::from(art_type).unwrap();
        
        let collection = &mut ctx.accounts.collection;
        let clock = clock::Clock::get().unwrap();

        collection.creator = ctx.accounts.creator.key();
        collection.id = ctx.accounts.creator_account.collections.checked_add(1).unwrap();
        collection.title = title;
        collection.created_at = clock.unix_timestamp;
        collection.last_updated = clock.unix_timestamp;
        collection.art_type = art_type;
        collection.items = 0;
        collection.purchase_mint = ctx.accounts.mint.key();
        collection.payment_vault = ctx.accounts.payment_vault.key();
        collection.cover_art_cid = art_cid;
        collection.nft_info_account = Pubkey::default();
        collection.bump = *ctx.bumps.get("collection").unwrap();

        let creator = &mut ctx.accounts.creator_account;
        creator.collections = creator.collections.checked_add(1).unwrap();

        Ok(())
    }

    pub fn upload_content(ctx: Context<UploadContent>, title: String, content_cid: String) -> Result<()> {
        require!(content_cid.len() <= Content::CID_LEN, SolomonError::MaxCIDLengthExceeded);
        require!(title.len() <= Content::MAX_TITLE_LEN, SolomonError::MaxTitleLengthExceeded);

        let clock = clock::Clock::get().unwrap();

        let content = &mut ctx.accounts.content;
        content.creator = ctx.accounts.creator.key();
        content.collection = ctx.accounts.collection.key();
        content.title = title;
        content.content_cid = content_cid;

        let collection = &mut ctx.accounts.collection;
        collection.last_updated = clock.unix_timestamp;
        collection.items = collection.items.checked_add(1).unwrap();
        Ok(())
    }

    pub fn create_master_edition_nft(
        ctx: Context<CreateMasterEdition>,
        metadata_title: String,
        metadata_symbol: String,
        metadata_uri: String,
        mint_price: u64,
        max_supply: u64,
    ) -> Result<()> {
        require!(metadata_symbol.len() < NftDetails::MAX_SYMBOL_LEN, SolomonError::MaxSymbolLengthExceeded);
        require!(metadata_title.len() < NftDetails::MAX_TITLE_LEN, SolomonError::MaxTitleLengthExceeded);
        require!(metadata_uri.len() < NftDetails::URI_LEN, SolomonError::MaxURILengthExceeded);
        let collection_key = ctx.accounts.collection.key();
        let collection = mpl_token_metadata::state::Collection {
            verified: false,
            key: collection_key,
        };

        // Create mint account
        msg!("Creating mint account!");
        msg!("{}", ctx.accounts.mint.key());
        system_program::create_account(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                system_program::CreateAccount {
                    from: ctx.accounts.creator.to_account_info(),
                    to: ctx.accounts.mint.to_account_info()
                },
            ),
            10000000,
            82,
            &ctx.accounts.token_program.key(),
        )?;

        // Initialize mint account
        msg!("Initializing mint account!");
        anchor_spl::token::initialize_mint(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                anchor_spl::token::InitializeMint {
                    mint: ctx.accounts.mint.to_account_info(),
                    rent: ctx.accounts.rent.to_account_info(),
                },
            ),
            0,
            &ctx.accounts.creator.key(),
            Some(&ctx.accounts.creator.key()),
        )?;

        // Create nft vault
        anchor_spl::associated_token::create(CpiContext::new(
            ctx.accounts.associated_token_program.to_account_info(),
            anchor_spl::associated_token::Create {
                payer: ctx.accounts.creator.to_account_info(),
                associated_token: ctx.accounts.nft_vault.to_account_info(),
                authority: ctx.accounts.collection.to_account_info(),
                mint: ctx.accounts.mint.to_account_info(),
                system_program: ctx.accounts.system_program.to_account_info(),
                token_program: ctx.accounts.token_program.to_account_info(),
                rent: ctx.accounts.rent.to_account_info(),
            },
        ))?;


        // Mint to token account(nft_vault)
        msg!("Minting to nft vault");
        anchor_spl::token::mint_to(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                anchor_spl::token::MintTo {
                    mint: ctx.accounts.mint.to_account_info(),
                    to: ctx.accounts.nft_vault.to_account_info(),
                    authority: ctx.accounts.creator.to_account_info(),
                },
            ),
            1,
        )?;

        // Create metadata accounts
        let creators = vec![
            mpl_token_metadata::state::Creator {
                address: ctx.accounts.creator.key(),
                verified: false,
                share: 100,
            },
        ];

        msg!("Creating metadata accounts");
        invoke(
            &mpl_instruction::create_metadata_accounts_v2(
                TOKEN_METADATA_PROGRAM_ID,
                ctx.accounts.metadata.key(),
                ctx.accounts.mint.key(),
                ctx.accounts.creator.key(),
                ctx.accounts.creator.key(),
                ctx.accounts.creator.key(),
                metadata_title.to_owned(),
                metadata_symbol.to_owned(),
                metadata_uri.to_owned(),
                Some(creators),
                1,
                true,
                false,
                Some(collection),
                None
            ),
            &[
            ctx.accounts.metadata.to_account_info(),
            ctx.accounts.mint.to_account_info(),
            ctx.accounts.creator.to_account_info(),
            ctx.accounts.system_program.to_account_info(),
            ctx.accounts.rent.to_account_info(),
            ],
        )?;

        // Create master edition nft
        msg!("Creating master edition");
        invoke(
            &mpl_instruction::create_master_edition_v3(
                TOKEN_METADATA_PROGRAM_ID,
                ctx.accounts.master_edition.key(),
                ctx.accounts.mint.key(),
                ctx.accounts.creator.key(),
                ctx.accounts.creator.key(),
                ctx.accounts.metadata.key(),
                ctx.accounts.creator.key(),
                Some(max_supply)
            ),
            &[
                ctx.accounts.master_edition.to_account_info(),
                ctx.accounts.mint.to_account_info(),
                ctx.accounts.creator.to_account_info(),
                ctx.accounts.metadata.to_account_info(),
                ctx.accounts.token_program.to_account_info(),
                ctx.accounts.system_program.to_account_info(),
                ctx.accounts.rent.to_account_info(),
            ],
        )?;

        let nft_info = &mut ctx.accounts.nft_info_account;
        nft_info.collection = ctx.accounts.collection.key();
        nft_info.mint_price = mint_price;
        nft_info.max_print_editions = max_supply;
        nft_info.minted_copies = 0;
        nft_info.master_edition = ctx.accounts.master_edition.key();
        nft_info.master_edition_metadata = ctx.accounts.metadata.key();
        nft_info.master_edition_mint = ctx.accounts.mint.key();
        nft_info.master_edition_vault = ctx.accounts.nft_vault.key();
        nft_info.title = metadata_title.to_owned();
        nft_info.symbol = metadata_symbol.to_owned();
        nft_info.uri = metadata_uri.to_owned();

        let collection = &mut ctx.accounts.collection;
        collection.nft_info_account = ctx.accounts.nft_info_account.key();

        Ok(())
    }


    pub fn purchase_nft(ctx: Context<MintNft>) -> Result<()> {
        // Create mint account
        msg!("Creating mint account");
        msg!("{}", ctx.accounts.new_mint.key());
        system_program::create_account(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                system_program::CreateAccount {
                    from: ctx.accounts.buyer.to_account_info(),
                    to: ctx.accounts.new_mint.to_account_info()
                },
            ),
            10000000,
            82,
            &ctx.accounts.token_program.key(),
        )?;

        // Initialize mint account
        msg!("Initializing mint account");
        anchor_spl::token::initialize_mint(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                anchor_spl::token::InitializeMint {
                    mint: ctx.accounts.new_mint.to_account_info(),
                    rent: ctx.accounts.rent.to_account_info(),
                },
            ),
            0,
            &ctx.accounts.buyer.key(),
            Some(&ctx.accounts.buyer.key()),
        )?;

        // Creating buyer's ata
        msg!("Creating buyer's nft token account");
        anchor_spl::associated_token::create(CpiContext::new(
            ctx.accounts.associated_token_program.to_account_info(),
            anchor_spl::associated_token::Create {
                payer: ctx.accounts.buyer.to_account_info(),
                associated_token: ctx.accounts.buyer_nft_vault.to_account_info(),
                authority: ctx.accounts.buyer.to_account_info(),
                mint: ctx.accounts.new_mint.to_account_info(),
                system_program: ctx.accounts.system_program.to_account_info(),
                token_program: ctx.accounts.token_program.to_account_info(),
                rent: ctx.accounts.rent.to_account_info(),
            },
        ))?;

        // Mint to token account
        msg!("Minting to token account");
        anchor_spl::token::mint_to(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                anchor_spl::token::MintTo {
                    mint: ctx.accounts.new_mint.to_account_info(),
                    to: ctx.accounts.buyer_nft_vault.to_account_info(),
                    authority: ctx.accounts.buyer.to_account_info(),
                },
            ),
            1,
        )?;

        let nft_info = &mut ctx.accounts.nft_info_account;
        let edition = nft_info.minted_copies.checked_add(1).unwrap();


        // Create Print edition nft
        let bump = ctx.accounts.collection.bump;
        let creator_key = ctx.accounts.collection.creator;
        let collection_id_to_le_bytes = ctx.accounts.collection.id.to_le_bytes();

        let collection_seeds = &[
            "collection".as_bytes().as_ref(),
            creator_key.as_ref(),
            collection_id_to_le_bytes.as_ref(),
            &[bump]
        ];
    
        msg!("Creating print edition");
        msg!("{}", ctx.accounts.print_edition.key());
        invoke_signed(
            &mpl_instruction::mint_new_edition_from_master_edition_via_token(
                TOKEN_METADATA_PROGRAM_ID,
                ctx.accounts.new_metadata.key(),
                ctx.accounts.print_edition.key(),
                ctx.accounts.master_edition.key(),
                ctx.accounts.new_mint.key(),
                ctx.accounts.buyer.key(),
                ctx.accounts.buyer.key(),
                ctx.accounts.collection.key(),
                ctx.accounts.master_edition_vault.key(),
                ctx.accounts.buyer.key(),
                ctx.accounts.master_edition_metadata.key(),
                ctx.accounts.master_edition_mint.key(),
                edition,
            ),
            &[
                ctx.accounts.new_metadata.to_account_info(),
                ctx.accounts.print_edition.to_account_info(),
                ctx.accounts.master_edition.to_account_info(),
                ctx.accounts.new_mint.to_account_info(),
                ctx.accounts.edition_mark_pda.to_account_info(),
                ctx.accounts.buyer.to_account_info(),
                ctx.accounts.master_edition_vault.to_account_info(),
                ctx.accounts.collection.to_account_info(), // owner of nft_vault
                ctx.accounts.master_edition_vault.to_account_info(),
                ctx.accounts.buyer.to_account_info(),
                ctx.accounts.master_edition_metadata.to_account_info(),
                ctx.accounts.master_edition_mint.to_account_info(),
                ctx.accounts.token_program.to_account_info(),
                ctx.accounts.system_program.to_account_info(),
                ctx.accounts.rent.to_account_info(),
                ctx.accounts.token_metadata_program.to_account_info(),
            ],
            &[&collection_seeds[..]]
        )?;

        nft_info.minted_copies = edition;

        // Make transfer as payment for minting
        msg!("initializing transfer");
        let price = nft_info.mint_price;
        anchor_spl::token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.buyer_token_account.to_account_info(),
                    to: ctx.accounts.payment_vault.to_account_info(),
                    authority: ctx.accounts.buyer.to_account_info(),
                }
            ),
            price
        )?;
        Ok(())
    }
}

#[derive(Accounts)]
pub struct InitCreator<'info> {
    #[account(mut)]
    creator: Signer<'info>,
    #[account(
        init,
        payer = creator,
        space = 8 + Creator::SIZE,
        seeds = ["creator".as_bytes().as_ref(), creator.key().as_ref()],
        bump
    )]
    creator_account: Box<Account<'info, Creator>>,
    system_program: Program<'info, System>
}

#[derive(Accounts)]
pub struct CreateCollection<'info> {
    #[account(mut)]
    creator: Signer<'info>,
    #[account(mut, has_one = creator)]
    creator_account: Box<Account<'info, Creator>>,
    #[account(
        init,
        payer = creator,
        space = 8 + Collection::SIZE,
        seeds = ["collection".as_bytes().as_ref(), creator.key().as_ref(), (creator_account.collections + 1).to_le_bytes().as_ref()],
        bump
    )]
    collection: Box<Account<'info, Collection>>,
    mint: Box<Account<'info, Mint>>,

    #[account(
        init,
        payer = creator,
        seeds = ["vault".as_bytes().as_ref(), collection.key().as_ref()],
        bump,
        token::mint = mint,
        token::authority = collection,
    )]
    payment_vault: Box<Account<'info, TokenAccount>>,

    token_program: Program<'info, Token>, 
    associated_token_program: Program<'info, AssociatedToken>,
    system_program: Program<'info, System>,
    rent: Sysvar<'info, Rent>
}


#[derive(Accounts)]
pub struct UploadContent<'info> {
    #[account(mut)]
    creator: Signer<'info>,
    #[account(has_one = creator)]
    creator_account: Box<Account<'info, Creator>>,
    #[account(mut, has_one = creator)]
    collection: Box<Account<'info, Collection>>,
    #[account(
        init,
        payer = creator,
        space = 8 + Content::SIZE,
        seeds = ["content".as_bytes().as_ref(), collection.key().as_ref(), (collection.items + 1).to_le_bytes().as_ref()],
        bump
    )]
    content: Box<Account<'info, Content>>,
    system_program: Program<'info, System>
}


#[derive(Accounts)]
pub struct CreateMasterEdition<'info> {
    #[account(mut)]
    creator: Signer<'info>,

    #[account(
        mut, has_one = creator,
        constraint = collection.nft_info_account == Pubkey::default()
    )]
    collection: Box<Account<'info, Collection>>,

    /// CHECK: Checks done by CPI to the token program
    #[account(mut, signer)]
    mint: AccountInfo<'info>,
    /// CHECK: Checks done by CPI to the mpl_token_metadata program
    #[account(mut)]
    metadata: UncheckedAccount<'info>,
    /// CHECK: Checks done by CPI to the mpl_token_metadata program
    #[account(mut)]
    master_edition: UncheckedAccount<'info>,

    #[account(
        init,
        payer = creator,
        space = 8 + NftDetails::SIZE,
        seeds = ["nft-info".as_bytes().as_ref(), collection.key().as_ref()],
        bump
    )]
    nft_info_account: Box<Account<'info, NftDetails>>,

    ///CHECK: 
    #[account(mut)]
    nft_vault: UncheckedAccount<'info>,

    token_program: Program<'info, Token>,
    associated_token_program: Program<'info, AssociatedToken>,
    system_program: Program<'info, System>,
    rent: Sysvar<'info, Rent>,
    /// CHECK: 
    token_metadata_program: UncheckedAccount<'info>,
}


#[derive(Accounts)]
pub struct MintNft<'info> {
    #[account(mut)]
    buyer: Signer<'info>,

    #[account(has_one = payment_vault, has_one = nft_info_account)]
    collection: Box<Account<'info, Collection>>,
    #[account( 
        mut,
        has_one = master_edition, has_one = master_edition_metadata, 
        has_one = master_edition_vault, has_one = master_edition_mint
    )]
    nft_info_account: Box<Account<'info, NftDetails>>,
    #[account(mut)]
    payment_vault: Account<'info, TokenAccount>,

    /// CHECK: Checks done by CPI to the mpl_token_metadata program
    master_edition_vault: UncheckedAccount<'info>,
    /// CHECK: Checks done by CPI to the mpl_token_metadata program
    #[account(mut)]
    master_edition: UncheckedAccount<'info>,
    /// CHECK: Checks done by CPI to the mpl_token_metadata program
    master_edition_metadata: UncheckedAccount<'info>,
    /// CHECK: 
    #[account(mut)]
    master_edition_mint: UncheckedAccount<'info>,
    
    /// CHECK: Checks done by CPI to the mpl_token_metadata program
    #[account(mut, signer, constraint = new_mint.key() != nft_info_account.master_edition_mint)]
    new_mint: AccountInfo<'info>,
    /// CHECK: Checks done by CPI to the mpl_token_metadata program
    #[account(mut)]
    new_metadata: UncheckedAccount<'info>,
    /// CHECK: Checks done by CPI to the mpl_token_metadata program
    #[account(mut)]
    print_edition: UncheckedAccount<'info>,
    /// CHECK: Checks done by CPI to the mpl_token_metadata program
    #[account(mut)]
    edition_mark_pda: UncheckedAccount<'info>,

    #[account(
        mut,
        constraint = buyer_token_account.owner == buyer.key(),
        constraint = buyer_token_account.mint == collection.purchase_mint,
        constraint = buyer_token_account.amount >= nft_info_account.mint_price @SolomonError::InsufficientBalance,
    )]
    buyer_token_account: Box<Account<'info, TokenAccount>>,
    /// CHECK:
    #[account(mut)]
    buyer_nft_vault: UncheckedAccount<'info>,

    token_program: Program<'info, Token>,
    associated_token_program: Program<'info, AssociatedToken>,
    /// CHECK: 
    token_metadata_program: UncheckedAccount<'info>,
    system_program: Program<'info, System>,
    rent: Sysvar<'info, Rent>,
}

#[account]
pub struct Creator {
    creator: Pubkey,
    username: String, // Max len 20
    profile_picture_cid: String,
    join_date: i64,
    description: String, // Max len 40
    bump: u8,
    collections: u64,
}

impl Creator {
    const MAX_DESCRIPTION_LEN: usize = 40;
    const MAX_USERNAME_LEN: usize = 20;
    const CID_LEN: usize = 50;

    const SIZE: usize = 32 + (4 + Self::MAX_USERNAME_LEN) + (4 + Self::CID_LEN)+ 
        8 + (4 + Self::MAX_DESCRIPTION_LEN) + 1 + 8; 
}

#[account]
pub struct Collection {
    id: u64,
    creator: Pubkey,
    title: String, // Max len 20
    created_at: i64,
    last_updated: i64,
    art_type: u8,
    items: u64,
    purchase_mint: Pubkey,
    payment_vault: Pubkey,
    cover_art_cid: String,
    nft_info_account: Pubkey,
    bump: u8,
}

impl Collection {
    const CID_LEN: usize = 50;
    const MAX_TITLE_LEN: usize = 20;
    const SIZE: usize = 1 + 32 + (4 + Self::MAX_TITLE_LEN) + 8 + 8 + 1 + 8 + 32 + 32 + (4 + Self::CID_LEN) + 32 + 1;
}

#[account]
pub struct Content {
    creator: Pubkey,
    collection: Pubkey,
    title: String, // Max len 20
    content_cid: String,
}

impl Content {
    const MAX_TITLE_LEN: usize = 20;
    const CID_LEN: usize = 50;

    const SIZE: usize = 32 + 32 + (4 + Self::MAX_TITLE_LEN) + (4 + Self::CID_LEN);
}

#[account]
pub struct NftDetails {
    collection: Pubkey,
    //purchase_mint: Pubkey,
    mint_price: u64,
    max_print_editions: u64,
    minted_copies: u64,
    master_edition: Pubkey,
    master_edition_metadata: Pubkey,
    master_edition_mint: Pubkey,
    master_edition_vault: Pubkey,
    title: String,
    symbol: String,
    uri: String,
}

impl NftDetails {
    const MAX_SYMBOL_LEN: usize = 8;
    const MAX_TITLE_LEN: usize = 20;
    const URI_LEN: usize = 200;

    const SIZE: usize = 32 + 8 + 8 + 8 + 32 + 32 + 32 + 32 + (4 + Self::MAX_SYMBOL_LEN)
        + (4 + Self::MAX_TITLE_LEN) + (4 + Self::URI_LEN);
}

pub enum ArtType {
    Writing,
    Video,
    Music,
    Painting,
    Design,
    Photography,
    Adult,
}

impl ArtType {
    fn from(val: u8) -> std::result::Result<ArtType, SolomonError> {
        match val {
            1 => Ok(ArtType::Writing),
            2 => Ok(ArtType::Video),
            3 => Ok(ArtType::Music),
            4 => Ok(ArtType::Painting),
            5 => Ok(ArtType::Design),
            6 => Ok(ArtType::Photography),
            7 => Ok(ArtType::Adult),
            invalid_type => {
                msg!("Invalid art type: {}", invalid_type);
                Err(SolomonError::InvalidArtTypeConversion)
            }
        }
    }
}


#[error_code]
pub enum SolomonError {
    MaxUsernameLengthExceeded,
    MaxDescriptionLengthExceeded,
    MaxTitleLengthExceeded,
    InvalidArtTypeConversion,
    MaxCIDLengthExceeded,
    MaxSymbolLengthExceeded,
    MaxURILengthExceeded,
    InsufficientBalance,
    #[msg("Content type should match collection")]
    ArtTypeMisMatch,
}


