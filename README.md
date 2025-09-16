# SCAI Tips 合约

一个基于 Solana 与 Anchor 的论文打赏合约，支持管理员管理、论文登记、作者地址绑定与安全打赏，内置必要的校验与统计字段，便于前端或服务端集成。

- **Program ID**: `J3u5yi5qkuhX6rK1q6AXNYn6cfahFnLfHqwxBPz3EoCT`
- **框架**: Anchor

## 功能概览
- **管理员初始化与管理**
  - `initialize_admin`：创建管理员配置 PDA，并把调用者设为初始管理员。
  - `add_admin`：添加新的管理员（最多 10 个）。
  - `remove_admin`：移除管理员（不能移除自己）。
- **论文登记与维护**
  - `register_paper`：按 DOI 创建论文账户，记录题目、上传者 SOL 地址与上传者身份。
  - `set_author_address`：由管理员为论文设置作者的 SOL 地址。
- **打赏**
  - `tip_paper`：任何用户可向论文作者地址直接转账打赏（系统程序转账），并在论文账户中累计统计。

## 账户与数据结构

### `AdminConfig`
- 存储管理员地址列表与 PDA bump。
- 字段：
  - `admins: Vec<Pubkey>`：管理员公钥列表（最多 10 个）。
  - `bump: u8`
- PDA：`seeds = [b"admin_config"]`
- 初始化空间估算：`8 + 4 + (32 * 10) + 1`

### `Paper`
- 存储论文基本信息与打赏统计。
- 字段：
  - `doi: String`：DOI（最大 200 字节）。
  - `title: String`：标题（最大 500 字节）。
  - `author_sol_address: Pubkey`：作者 SOL 地址（仅管理员可设置，初始为默认值）。
  - `uploader_sol_address: Pubkey`：上传者 SOL 地址（登记时传入）。
  - `total_tips: u64`：累计打赏 lamports。
  - `tip_count: u64`：打赏次数。
  - `uploader: Pubkey`：登记者（交易签名者）。
  - `bump: u8`
- PDA：`seeds = [b"paper", doi.as_bytes()]`
- 初始化空间估算：`8 + 200 + 500 + 32 + 32 + 8 + 8 + 32 + 1`

## 指令（Instructions）

### 1) `initialize_admin`
- 作用：初始化管理员配置账户。
- 账户：
  - `admin_config`：`[init, seeds=["admin_config"], bump]` PDA
  - `admin`：`Signer`（初始管理员）
  - `system_program`
- 约束与事件：把 `admin` 加入 `admins` 列表。

### 2) `add_admin(new_admin: Pubkey)`
- 作用：添加管理员。
- 账户：
  - `admin_config`：`[mut, seeds=["admin_config"], bump=admin_config.bump]`
  - `admin`：`Signer`（必须已在 `admins` 中）
- 校验：
  - 调用者必须是管理员。
  - 不可重复添加。
  - 管理员最多 10 个。

### 3) `remove_admin(admin_to_remove: Pubkey)`
- 作用：移除管理员。
- 账户：
  - `admin_config`：同上
  - `admin`：`Signer`（必须是管理员，且不能移除自己）
- 校验：
  - 调用者必须是管理员。
  - 目标必须存在于管理员列表。
  - 不能移除自己。

### 4) `register_paper(doi: String, title: String, uploader_sol_address: Pubkey)`
- 作用：登记论文，仅设置上传者信息，作者地址后续由管理员设置。
- 账户：
  - `paper`：`[init, seeds=["paper", doi.as_bytes()], bump]` PDA
  - `uploader`：`Signer`
  - `system_program`
- 校验：
  - `doi` 非空且 `<= 200` 字节。
  - `title` 非空且 `<= 500` 字节。
- 初始状态：
  - `author_sol_address` 设为默认值（未设置）。
  - `total_tips = 0`，`tip_count = 0`。

### 5) `set_author_address(author_sol_address: Pubkey)`
- 作用：为论文设置作者 SOL 地址（仅管理员）。
- 账户：
  - `paper`：`[mut, seeds=["paper", paper.doi.as_bytes()], bump=paper.bump]`
  - `admin_config`：`[mut, seeds=["admin_config"], bump=admin_config.bump]`
  - `admin`：`Signer`（必须是管理员）
- 校验：
  - 调用者必须是管理员。
  - `author_sol_address` 不能为默认空地址。

### 6) `tip_paper(amount: u64)`
- 作用：向论文作者地址直接转账打赏，并更新统计。
- 账户：
  - `paper`：同上
  - `tipper`：`Signer`
  - `author_sol_account`：`UncheckedAccount`（必须等于 `paper.author_sol_address`）
  - `system_program`
- 校验：
  - `amount > 0`。
  - `amount <= 1_000_000_000` lamports（默认上限 1 SOL）。
  - `paper.author_sol_address` 已设置，且与 `author_sol_account` 匹配。
- 执行：调用系统程序 `transfer` 从 `tipper` 转账给作者。
- 统计：`total_tips += amount`，`tip_count += 1`。

## 错误码（ErrorCode）
- `InvalidDoi` / `DoiTooLong`
- `InvalidTitle` / `TitleTooLong`
- `InvalidAmount` / `AmountTooLarge`
- `Unauthorized`
- `AuthorAddressNotSet`
- `InvalidAuthorAddress`
- `AdminAlreadyExists` / `AdminNotFound` / `TooManyAdmins` / `CannotRemoveSelf`

## PDA 与种子
- 管理员配置：`["admin_config"]`
- 论文：`["paper", doi.as_bytes()]`

## 使用方式（TypeScript / Anchor 客户端）

> 以下示例基于 `tests/scai-tips.ts`，仅展示关键片段。

```ts
import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { ScaiTips } from "../target/types/scai_tips";

anchor.setProvider(anchor.AnchorProvider.env());
const program = anchor.workspace.ScaiTips as Program<ScaiTips>;
const provider = anchor.AnchorProvider.env();

// 1) 初始化管理员配置
const [adminConfigPda] = anchor.web3.PublicKey.findProgramAddressSync(
  [Buffer.from("admin_config")],
  program.programId
);
await program.methods.initializeAdmin().accounts({
  adminConfig: adminConfigPda,
  admin: provider.wallet.publicKey,
  systemProgram: anchor.web3.SystemProgram.programId,
}).rpc();

// 2) 登记论文
const doi = "10.1000/182";
const title = "A Sample Research Paper";
const [paperPda] = anchor.web3.PublicKey.findProgramAddressSync(
  [Buffer.from("paper"), Buffer.from(doi)],
  program.programId
);
await program.methods.registerPaper(doi, title, provider.wallet.publicKey).accounts({
  paper: paperPda,
  uploader: provider.wallet.publicKey,
  systemProgram: anchor.web3.SystemProgram.programId,
}).rpc();

// 3) 管理员设置作者地址
await program.methods.setAuthorAddress(provider.wallet.publicKey).accounts({
  paper: paperPda,
  adminConfig: adminConfigPda,
  admin: provider.wallet.publicKey,
}).rpc();

// 4) 打赏论文
const tipAmount = new anchor.BN(0.1 * anchor.web3.LAMPORTS_PER_SOL);
await program.methods.tipPaper(tipAmount).accounts({
  paper: paperPda,
  tipper: provider.wallet.publicKey,
  authorSolAccount: provider.wallet.publicKey,
  systemProgram: anchor.web3.SystemProgram.programId,
}).rpc();
```

## 本地开发与测试

### 环境准备
- 安装 Node.js、Yarn
- 安装 Rust、Solana CLI、Anchor
- 确保本地 `solana-test-validator` 可用

### 常用命令
- 构建 IDL/程序：
  - `anchor build`
- 运行本地测试：
  - `anchor test`

测试覆盖点参考 `tests/scai-tips.ts`：
- 管理员初始化/添加/移除
- 论文登记
- 设置作者地址（多管理员）
- 打赏与累计统计
- 常见错误路径（非管理员操作、重复添加、移除不存在管理员、作者未设置打赏、无效 DOI、无效金额等）

## 安全与边界
- 管理员变更由现有管理员签名授权，合约限制最多 10 名管理员。
- 打赏通过系统程序转账直接进入作者地址，不经合约托管。
- 金额上限默认 1 SOL（1_000_000_000 lamports），防止异常大额调用（可按需调整源码）。
- DOI/标题长度做上限限制，避免超大字符串占用存储。

## 集成建议
- 前端在展示打赏入口前，应先拉取 `Paper` 账户，确认 `author_sol_address` 已设置。
- 以 DOI 作为全局唯一键生成 `Paper` PDA，确保客户端传入与后端索引一致。
- 对打赏金额进行前端约束（> 0 且 <= 1 SOL），并在失败场景中提示错误码含义。

## 许可证
根据仓库根目录的 LICENSE 声明（如无则默认保留所有权利）。
# scai-tips
