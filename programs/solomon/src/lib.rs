use anchor_lang:: { 
    prelude::*, 
    solana_program::clock 
};

declare_id!("Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS");

#[program]
pub mod solomon {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {

        Ok(())
    }

    pub fn init_creator(ctx: Context<InitCreator>, username: String, description: String) -> Result<()> {
        require!(username.len() < Creator::MAX_USERNAME_LEN, 
            SolomonError::MaxUsernameLengthExceeded);
        require!(description.len() < Creator::MAX_DESCRIPTION_LEN, 
            SolomonError::MaxDescriptionLengthExceeded);

        let creator = &mut ctx.accounts.creator_account;
        let clock = clock::Clock::get().unwrap();

        creator.creator = ctx.accounts.creator.key();
        creator.username = username;
        creator.join_date = clock.unix_timestamp;
        creator.description = description;
        creator.bump = *ctx.bumps.get("creator_account").unwrap();
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize {}


#[derive(Accounts)]
#[instruction(username: String)]
pub struct InitCreator<'info> {
    #[account(mut)]
    creator: Signer<'info>,
    #[account(
        init,
        payer = creator,
        space = 8 + Creator::SIZE,
        seeds = ["creator".as_bytes().as_ref(), username.as_bytes().as_ref()],
        bump
    )]
    creator_account: Account<'info, Creator>,
    system_program: Program<'info, System>
}

#[derive(Accounts)]
pub struct CreateA


#[account]
pub struct Creator {
    creator: Pubkey,
    username: String, // Max len 20
    join_date: i64,
    description: String, // Max len 40
    bump: u8
}

impl Creator {
    const MAX_DESCRIPTION_LEN: usize = 40;
    const MAX_USERNAME_LEN: usize = 20;

    const SIZE: usize = 32 + (4+Self::MAX_USERNAME_LEN) + 8 + 
        (4+Self::MAX_DESCRIPTION_LEN) + 1; 
}

#[account]
pub struct Art {
    creator: Pubkey,
    id: String,
    created_at: i64,
    art_type: u8,
}

pub enum ArtType {
    Book,
    Movie,
    Music,
    Painting,
    Design,
    Adult,
}

#[error_code]
pub enum SolomonError {
    MaxUsernameLengthExceeded,
    MaxDescriptionLengthExceeded
}