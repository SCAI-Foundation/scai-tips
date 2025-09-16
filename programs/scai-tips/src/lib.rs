use anchor_lang::prelude::*;

declare_id!("J3u5yi5qkuhX6rK1q6AXNYn6cfahFnLfHqwxBPz3EoCT");

#[program]
pub mod scai_tips {
    use super::*;

    /// 初始化管理员配置
    pub fn initialize_admin(ctx: Context<InitializeAdmin>) -> Result<()> {
        let admin_config = &mut ctx.accounts.admin_config;
        admin_config.admins = vec![ctx.accounts.admin.key()]; // 初始管理员
        admin_config.bump = ctx.bumps.admin_config;
        
        msg!("Admin config initialized with initial admin: {}", ctx.accounts.admin.key());
        Ok(())
    }

    /// 添加管理员
    pub fn add_admin(
        ctx: Context<AddAdmin>,
        new_admin: Pubkey,
    ) -> Result<()> {
        let admin_config = &mut ctx.accounts.admin_config;
        
        // 验证当前用户是管理员
        require!(
            admin_config.admins.contains(&ctx.accounts.admin.key()),
            ErrorCode::Unauthorized
        );
        
        // 检查新管理员是否已存在
        require!(
            !admin_config.admins.contains(&new_admin),
            ErrorCode::AdminAlreadyExists
        );
        
        // 检查管理员数量限制（最多10个）
        require!(
            admin_config.admins.len() < 10,
            ErrorCode::TooManyAdmins
        );
        
        admin_config.admins.push(new_admin);
        
        msg!("Admin added: {}", new_admin);
        Ok(())
    }

    /// 移除管理员
    pub fn remove_admin(
        ctx: Context<RemoveAdmin>,
        admin_to_remove: Pubkey,
    ) -> Result<()> {
        let admin_config = &mut ctx.accounts.admin_config;
        
        // 验证当前用户是管理员
        require!(
            admin_config.admins.contains(&ctx.accounts.admin.key()),
            ErrorCode::Unauthorized
        );
        
        // 检查要移除的管理员是否存在
        require!(
            admin_config.admins.contains(&admin_to_remove),
            ErrorCode::AdminNotFound
        );
        
        // 不能移除自己（至少保留一个管理员）
        require!(
            admin_to_remove != ctx.accounts.admin.key(),
            ErrorCode::CannotRemoveSelf
        );
        
        // 移除管理员
        admin_config.admins.retain(|&admin| admin != admin_to_remove);
        
        msg!("Admin removed: {}", admin_to_remove);
        Ok(())
    }

    /// 注册论文（只设置上传者信息）
    pub fn register_paper(
        ctx: Context<RegisterPaper>,
        doi: String,
        title: String,
        uploader_sol_address: Pubkey,
    ) -> Result<()> {
        let paper = &mut ctx.accounts.paper;
        
        // 验证DOI格式（简单验证）
        require!(doi.len() > 0, ErrorCode::InvalidDoi);
        require!(doi.len() <= 200, ErrorCode::DoiTooLong);
        
        // 验证标题长度
        require!(title.len() > 0, ErrorCode::InvalidTitle);
        require!(title.len() <= 500, ErrorCode::TitleTooLong);
        
        paper.doi = doi;
        paper.title = title;
        paper.author_sol_address = Pubkey::default(); // 初始为空，需要管理员设置
        paper.uploader_sol_address = uploader_sol_address;
        paper.total_tips = 0;
        paper.tip_count = 0;
        paper.uploader = ctx.accounts.uploader.key();
        paper.bump = ctx.bumps.paper;
        
        msg!("Paper registered with DOI: {}, uploader: {}", paper.doi, paper.uploader);
        Ok(())
    }

    /// 设置论文作者地址（仅管理员）
    pub fn set_author_address(
        ctx: Context<SetAuthorAddress>,
        author_sol_address: Pubkey,
    ) -> Result<()> {
        let paper = &mut ctx.accounts.paper;
        let admin_config = &ctx.accounts.admin_config;
        
        // 验证当前用户是管理员
        require!(
            admin_config.admins.contains(&ctx.accounts.admin.key()),
            ErrorCode::Unauthorized
        );
        
        // 验证作者地址不能为空
        require!(author_sol_address != Pubkey::default(), ErrorCode::InvalidAuthorAddress);
        
        paper.author_sol_address = author_sol_address;
        
        msg!("Author address set for paper DOI: {}, author: {}", paper.doi, author_sol_address);
        Ok(())
    }

    /// 打赏论文
    pub fn tip_paper(ctx: Context<TipPaper>, amount: u64) -> Result<()> {
        let paper = &mut ctx.accounts.paper;
        
        // 验证打赏金额
        require!(amount > 0, ErrorCode::InvalidAmount);
        require!(amount <= 1000000000, ErrorCode::AmountTooLarge); // 最大10 SOL
        
        // 验证作者地址已设置
        require!(paper.author_sol_address != Pubkey::default(), ErrorCode::AuthorAddressNotSet);
        
        // 验证作者账户地址匹配
        require!(
            ctx.accounts.author_sol_account.key() == paper.author_sol_address,
            ErrorCode::InvalidAuthorAddress
        );
        
        // 执行转账给作者
        let cpi_context = CpiContext::new(
            ctx.accounts.system_program.to_account_info(),
            anchor_lang::system_program::Transfer {
                from: ctx.accounts.tipper.to_account_info(),
                to: ctx.accounts.author_sol_account.to_account_info(),
            },
        );
        anchor_lang::system_program::transfer(cpi_context, amount)?;
        
        // 更新论文统计信息
        paper.total_tips += amount;
        paper.tip_count += 1;
        
        msg!("Tip of {} lamports sent to author of paper with DOI: {}", amount, paper.doi);
        Ok(())
    }
}

/// 管理员配置账户
#[account]
pub struct AdminConfig {
    pub admins: Vec<Pubkey>,            // 管理员地址列表
    pub bump: u8,                       // PDA bump
}

/// 论文账户结构
#[account]
pub struct Paper {
    pub doi: String,                    // DOI号
    pub title: String,                  // 论文标题
    pub author_sol_address: Pubkey,     // 作者SOL地址（只能由管理员设置）
    pub uploader_sol_address: Pubkey,   // 上传者SOL地址
    pub total_tips: u64,                // 总打赏金额
    pub tip_count: u64,                 // 打赏次数
    pub uploader: Pubkey,               // 上传者地址
    pub bump: u8,                       // PDA bump
}

/// 初始化管理员配置的账户上下文
#[derive(Accounts)]
pub struct InitializeAdmin<'info> {
    #[account(
        init,
        payer = admin,
        space = 8 + 4 + (32 * 10) + 1, // discriminator + Vec<Pubkey> (max 10 admins) + bump
        seeds = [b"admin_config"],
        bump
    )]
    pub admin_config: Account<'info, AdminConfig>,
    
    #[account(mut)]
    pub admin: Signer<'info>,
    
    pub system_program: Program<'info, System>,
}

/// 添加管理员的账户上下文
#[derive(Accounts)]
pub struct AddAdmin<'info> {
    #[account(
        mut,
        seeds = [b"admin_config"],
        bump = admin_config.bump
    )]
    pub admin_config: Account<'info, AdminConfig>,
    
    #[account(mut)]
    pub admin: Signer<'info>,
}

/// 移除管理员的账户上下文
#[derive(Accounts)]
pub struct RemoveAdmin<'info> {
    #[account(
        mut,
        seeds = [b"admin_config"],
        bump = admin_config.bump
    )]
    pub admin_config: Account<'info, AdminConfig>,
    
    #[account(mut)]
    pub admin: Signer<'info>,
}

/// 注册论文的账户上下文
#[derive(Accounts)]
#[instruction(doi: String)]
pub struct RegisterPaper<'info> {
    #[account(
        init,
        payer = uploader,
        space = 8 + 200 + 500 + 32 + 32 + 8 + 8 + 32 + 1, // discriminator + doi + title + author_sol_address + uploader_sol_address + total_tips + tip_count + uploader + bump
        seeds = [b"paper", doi.as_bytes()],
        bump
    )]
    pub paper: Account<'info, Paper>,
    
    #[account(mut)]
    pub uploader: Signer<'info>,
    
    pub system_program: Program<'info, System>,
}

/// 设置论文作者地址的账户上下文（仅管理员）
#[derive(Accounts)]
pub struct SetAuthorAddress<'info> {
    #[account(
        mut,
        seeds = [b"paper", paper.doi.as_bytes()],
        bump = paper.bump
    )]
    pub paper: Account<'info, Paper>,
    
    #[account(
        mut,
        seeds = [b"admin_config"],
        bump = admin_config.bump
    )]
    pub admin_config: Account<'info, AdminConfig>,
    
    #[account(mut)]
    pub admin: Signer<'info>,
}

/// 打赏论文的账户上下文
#[derive(Accounts)]
pub struct TipPaper<'info> {
    #[account(
        mut,
        seeds = [b"paper", paper.doi.as_bytes()],
        bump = paper.bump
    )]
    pub paper: Account<'info, Paper>,
    
    #[account(mut)]
    pub tipper: Signer<'info>,
    
    /// 作者SOL地址账户（用于接收打赏）
    /// CHECK: 这是作者的钱包地址，由管理员设置
    #[account(mut)]
    pub author_sol_account: UncheckedAccount<'info>,
    
    pub system_program: Program<'info, System>,
}

#[error_code]
pub enum ErrorCode {
    #[msg("Invalid DOI format")]
    InvalidDoi,
    #[msg("DOI too long")]
    DoiTooLong,
    #[msg("Invalid title")]
    InvalidTitle,
    #[msg("Title too long")]
    TitleTooLong,
    #[msg("Invalid tip amount")]
    InvalidAmount,
    #[msg("Tip amount too large")]
    AmountTooLarge,
    #[msg("Unauthorized access")]
    Unauthorized,
    #[msg("Author address not set")]
    AuthorAddressNotSet,
    #[msg("Invalid author address")]
    InvalidAuthorAddress,
    #[msg("Admin already exists")]
    AdminAlreadyExists,
    #[msg("Admin not found")]
    AdminNotFound,
    #[msg("Too many admins")]
    TooManyAdmins,
    #[msg("Cannot remove self")]
    CannotRemoveSelf,
}