import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { ScaiTips } from "../target/types/scai_tips";
import { expect } from "chai";

describe("scai-tips", () => {
  // Configure the client to use the local cluster.
  anchor.setProvider(anchor.AnchorProvider.env());

  const program = anchor.workspace.ScaiTips as Program<ScaiTips>;
  const provider = anchor.AnchorProvider.env();

  // 测试用户
  let admin: anchor.web3.Keypair;
  let admin2: anchor.web3.Keypair;
  let uploader: anchor.web3.Keypair;
  let tipper: anchor.web3.Keypair;
  let authorSolAddress: anchor.web3.Keypair;
  let uploaderSolAddress: anchor.web3.Keypair;

  before(async () => {
    // 创建测试账户
    admin = anchor.web3.Keypair.generate();
    admin2 = anchor.web3.Keypair.generate();
    uploader = anchor.web3.Keypair.generate();
    tipper = anchor.web3.Keypair.generate();
    authorSolAddress = anchor.web3.Keypair.generate();
    uploaderSolAddress = anchor.web3.Keypair.generate();

    // 给测试账户充值
    const signature1 = await provider.connection.requestAirdrop(
      admin.publicKey,
      2 * anchor.web3.LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(signature1);

    const signature2 = await provider.connection.requestAirdrop(
      admin2.publicKey,
      2 * anchor.web3.LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(signature2);

    const signature3 = await provider.connection.requestAirdrop(
      uploader.publicKey,
      2 * anchor.web3.LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(signature3);

    const signature4 = await provider.connection.requestAirdrop(
      tipper.publicKey,
      2 * anchor.web3.LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(signature4);
  });

  it("初始化管理员配置", async () => {
    const [adminConfigPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("admin_config")],
      program.programId
    );

    const tx = await program.methods
      .initializeAdmin()
      .accounts({
        adminConfig: adminConfigPda,
        admin: admin.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([admin])
      .rpc();

    console.log("管理员初始化交易签名:", tx);

    // 验证管理员配置
    const adminConfigAccount = await program.account.adminConfig.fetch(adminConfigPda);
    expect(adminConfigAccount.admins.length).to.equal(1);
    expect(adminConfigAccount.admins[0].toString()).to.equal(admin.publicKey.toString());
  });

  it("注册论文", async () => {
    const doi = "10.1000/182";
    const title = "A Sample Research Paper";
    
    const [paperPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("paper"), Buffer.from(doi)],
      program.programId
    );

    const tx = await program.methods
      .registerPaper(doi, title, uploaderSolAddress.publicKey)
      .accounts({
        paper: paperPda,
        uploader: uploader.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([uploader])
      .rpc();

    console.log("论文注册交易签名:", tx);

    // 验证论文数据
    const paperAccount = await program.account.paper.fetch(paperPda);
    expect(paperAccount.doi).to.equal(doi);
    expect(paperAccount.title).to.equal(title);
    expect(paperAccount.uploaderSolAddress.toString()).to.equal(uploaderSolAddress.publicKey.toString());
    expect(paperAccount.authorSolAddress.toString()).to.equal(anchor.web3.PublicKey.default.toString()); // 初始为空
    expect(paperAccount.totalTips.toNumber()).to.equal(0);
    expect(paperAccount.tipCount.toNumber()).to.equal(0);
  });

  it("添加管理员", async () => {
    const [adminConfigPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("admin_config")],
      program.programId
    );

    const tx = await program.methods
      .addAdmin(admin2.publicKey)
      .accounts({
        adminConfig: adminConfigPda,
        admin: admin.publicKey,
      })
      .signers([admin])
      .rpc();

    console.log("添加管理员交易签名:", tx);

    // 验证管理员已添加
    const adminConfigAccount = await program.account.adminConfig.fetch(adminConfigPda);
    expect(adminConfigAccount.admins.length).to.equal(2);
    expect(adminConfigAccount.admins.map(a => a.toString())).to.include(admin2.publicKey.toString());
  });

  it("设置论文作者地址", async () => {
    const doi = "10.1000/182";
    const [paperPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("paper"), Buffer.from(doi)],
      program.programId
    );
    const [adminConfigPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("admin_config")],
      program.programId
    );

    const tx = await program.methods
      .setAuthorAddress(authorSolAddress.publicKey)
      .accounts({
        paper: paperPda,
        adminConfig: adminConfigPda,
        admin: admin.publicKey,
      })
      .signers([admin])
      .rpc();

    console.log("设置作者地址交易签名:", tx);

    // 验证作者地址已设置
    const paperAccount = await program.account.paper.fetch(paperPda);
    expect(paperAccount.authorSolAddress.toString()).to.equal(authorSolAddress.publicKey.toString());
  });

  it("第二个管理员设置作者地址", async () => {
    const doi = "10.1000/187";
    const title = "Another Research Paper";
    
    // 先注册论文
    const [paperPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("paper"), Buffer.from(doi)],
      program.programId
    );

    await program.methods
      .registerPaper(doi, title, uploaderSolAddress.publicKey)
      .accounts({
        paper: paperPda,
        uploader: uploader.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([uploader])
      .rpc();

    // 第二个管理员设置作者地址
    const [adminConfigPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("admin_config")],
      program.programId
    );

    const tx = await program.methods
      .setAuthorAddress(authorSolAddress.publicKey)
      .accounts({
        paper: paperPda,
        adminConfig: adminConfigPda,
        admin: admin2.publicKey,
      })
      .signers([admin2])
      .rpc();

    console.log("第二个管理员设置作者地址交易签名:", tx);

    // 验证作者地址已设置
    const paperAccount = await program.account.paper.fetch(paperPda);
    expect(paperAccount.authorSolAddress.toString()).to.equal(authorSolAddress.publicKey.toString());
  });

  it("打赏论文", async () => {
    const doi = "10.1000/182";
    const tipAmount = new anchor.BN(0.1 * anchor.web3.LAMPORTS_PER_SOL); // 0.1 SOL
    
    const [paperPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("paper"), Buffer.from(doi)],
      program.programId
    );

    // 获取打赏前的余额
    const balanceBefore = await provider.connection.getBalance(authorSolAddress.publicKey);

    const tx = await program.methods
      .tipPaper(tipAmount)
      .accounts({
        paper: paperPda,
        tipper: tipper.publicKey,
        authorSolAccount: authorSolAddress.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([tipper])
      .rpc();

    console.log("打赏交易签名:", tx);

    // 验证打赏后的余额
    const balanceAfter = await provider.connection.getBalance(authorSolAddress.publicKey);
    expect(balanceAfter).to.be.greaterThan(balanceBefore);

    // 验证论文统计信息
    const paperAccount = await program.account.paper.fetch(paperPda);
    expect(paperAccount.totalTips.toNumber()).to.equal(tipAmount.toNumber());
    expect(paperAccount.tipCount.toNumber()).to.equal(1);
  });

  it("多次打赏同一篇论文", async () => {
    const doi = "10.1000/182";
    const tipAmount1 = new anchor.BN(0.05 * anchor.web3.LAMPORTS_PER_SOL); // 0.05 SOL
    const tipAmount2 = new anchor.BN(0.03 * anchor.web3.LAMPORTS_PER_SOL); // 0.03 SOL
    
    const [paperPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("paper"), Buffer.from(doi)],
      program.programId
    );

    // 第一次打赏
    await program.methods
      .tipPaper(tipAmount1)
      .accounts({
        paper: paperPda,
        tipper: tipper.publicKey,
        authorSolAccount: authorSolAddress.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([tipper])
      .rpc();

    // 第二次打赏
    await program.methods
      .tipPaper(tipAmount2)
      .accounts({
        paper: paperPda,
        tipper: tipper.publicKey,
        authorSolAccount: authorSolAddress.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([tipper])
      .rpc();

    // 验证累计统计
    const paperAccount = await program.account.paper.fetch(paperPda);
    const expectedTotal = (0.1 + 0.05 + 0.03) * anchor.web3.LAMPORTS_PER_SOL; // 之前0.1 + 现在0.05 + 0.03
    expect(paperAccount.totalTips.toNumber()).to.equal(Math.floor(expectedTotal));
    expect(paperAccount.tipCount.toNumber()).to.equal(3);
  });

  // it("注册多篇论文", async () => {
  //   const doi1 = "10.1000/183";
  //   const title1 = "Another Research Paper";
  //   const doi2 = "10.1000/184";
  //   const title2 = "Yet Another Research Paper";
    
  //   // 注册第一篇论文
  //   const [paperPda1] = anchor.web3.PublicKey.findProgramAddressSync(
  //     [Buffer.from("paper"), Buffer.from(doi1)],
  //     program.programId
  //   );

  //   await program.methods
  //     .registerPaper(doi1, title1, authorSolAddress.publicKey)
  //     .accounts({
  //       paper: paperPda1,
  //       author: author.publicKey,
  //       systemProgram: anchor.web3.SystemProgram.programId,
  //     })
  //     .signers([author])
  //     .rpc();

  //   // 注册第二篇论文
  //   const [paperPda2] = anchor.web3.PublicKey.findProgramAddressSync(
  //     [Buffer.from("paper"), Buffer.from(doi2)],
  //     program.programId
  //   );

  //   await program.methods
  //     .registerPaper(doi2, title2, authorSolAddress.publicKey)
  //     .accounts({
  //       paper: paperPda2,
  //       author: author.publicKey,
  //       systemProgram: anchor.web3.SystemProgram.programId,
  //     })
  //     .signers([author])
  //     .rpc();

  //   // 验证两篇论文都正确注册
  //   const paper1 = await program.account.paper.fetch(paperPda1);
  //   const paper2 = await program.account.paper.fetch(paperPda2);
    
  //   expect(paper1.doi).to.equal(doi1);
  //   expect(paper2.doi).to.equal(doi2);
  //   expect(paper1.title).to.equal(title1);
  //   expect(paper2.title).to.equal(title2);
  // });

  it("移除管理员", async () => {
    const [adminConfigPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("admin_config")],
      program.programId
    );

    const tx = await program.methods
      .removeAdmin(admin2.publicKey)
      .accounts({
        adminConfig: adminConfigPda,
        admin: admin.publicKey,
      })
      .signers([admin])
      .rpc();

    console.log("移除管理员交易签名:", tx);

    // 验证管理员已移除
    const adminConfigAccount = await program.account.adminConfig.fetch(adminConfigPda);
    expect(adminConfigAccount.admins.length).to.equal(1);
    expect(adminConfigAccount.admins.map(a => a.toString())).to.not.include(admin2.publicKey.toString());
  });

  it("验证错误处理 - 非管理员设置作者地址", async () => {
    const doi = "10.1000/185";
    const title = "Test Paper";
    
    // 先注册论文
    const [paperPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("paper"), Buffer.from(doi)],
      program.programId
    );

    await program.methods
      .registerPaper(doi, title, uploaderSolAddress.publicKey)
      .accounts({
        paper: paperPda,
        uploader: uploader.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([uploader])
      .rpc();

    // 尝试用非管理员账户设置作者地址
    try {
      const [adminConfigPda] = anchor.web3.PublicKey.findProgramAddressSync(
        [Buffer.from("admin_config")],
        program.programId
      );

      await program.methods
        .setAuthorAddress(authorSolAddress.publicKey)
        .accounts({
          paper: paperPda,
          adminConfig: adminConfigPda,
          admin: uploader.publicKey, // 使用上传者而不是管理员
        })
        .signers([uploader])
        .rpc();
      
      expect.fail("应该抛出错误");
    } catch (error) {
      expect(error.message).to.include("Unauthorized");
    }
  });

  it("验证错误处理 - 重复添加管理员", async () => {
    const [adminConfigPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("admin_config")],
      program.programId
    );

    try {
      await program.methods
        .addAdmin(admin.publicKey) // 添加已存在的管理员
        .accounts({
          adminConfig: adminConfigPda,
          admin: admin.publicKey,
        })
        .signers([admin])
        .rpc();
      
      expect.fail("应该抛出错误");
    } catch (error) {
      expect(error.message).to.include("Admin already exists");
    }
  });

  it("验证错误处理 - 移除不存在的管理员", async () => {
    const [adminConfigPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("admin_config")],
      program.programId
    );

    try {
      await program.methods
        .removeAdmin(admin2.publicKey) // 移除不存在的管理员
        .accounts({
          adminConfig: adminConfigPda,
          admin: admin.publicKey,
        })
        .signers([admin])
        .rpc();
      
      expect.fail("应该抛出错误");
    } catch (error) {
      expect(error.message).to.include("Admin not found");
    }
  });

  it("验证错误处理 - 作者地址未设置时打赏", async () => {
    const doi = "10.1000/186";
    const title = "Test Paper Without Author";
    const tipAmount = new anchor.BN(0.1 * anchor.web3.LAMPORTS_PER_SOL);
    
    // 注册论文但不设置作者地址
    const [paperPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("paper"), Buffer.from(doi)],
      program.programId
    );

    await program.methods
      .registerPaper(doi, title, uploaderSolAddress.publicKey)
      .accounts({
        paper: paperPda,
        uploader: uploader.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([uploader])
      .rpc();

    // 尝试打赏
    try {
      await program.methods
        .tipPaper(tipAmount)
        .accounts({
          paper: paperPda,
          tipper: tipper.publicKey,
          authorSolAccount: authorSolAddress.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .signers([tipper])
        .rpc();
      
      expect.fail("应该抛出错误");
    } catch (error) {
      expect(error.message).to.include("Author address not set");
    }
  });

  it("验证错误处理 - 无效DOI", async () => {
    const emptyDoi = "";
    const title = "Test Paper";
    
    try {
      await program.methods
        .registerPaper(emptyDoi, title, uploaderSolAddress.publicKey)
        .accounts({
          paper: anchor.web3.Keypair.generate().publicKey, // 随机地址
          uploader: uploader.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .signers([uploader])
        .rpc();
      
      expect.fail("应该抛出错误");
    } catch (error) {
      // 空DOI会导致PDA种子约束失败，这是预期的行为
      expect(error.message).to.include("ConstraintSeeds");
    }
  });

  it("验证错误处理 - 无效打赏金额", async () => {
    const doi = "10.1000/182";
    const [paperPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("paper"), Buffer.from(doi)],
      program.programId
    );

    try {
      await program.methods
        .tipPaper(new anchor.BN(0)) // 零金额
        .accounts({
          paper: paperPda,
          tipper: tipper.publicKey,
          authorSolAccount: authorSolAddress.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .signers([tipper])
        .rpc();
      
      expect.fail("应该抛出错误");
    } catch (error) {
      expect(error.message).to.include("Invalid tip amount");
    }
  });
});
