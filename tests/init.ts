import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { ScaiTips } from "../target/types/scai_tips";

describe("初始化调用示例", () => {
  // 配置客户端使用本地集群
  anchor.setProvider(anchor.AnchorProvider.env());

  const program = anchor.workspace.ScaiTips as Program<ScaiTips>;
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);


  
  let uploader: anchor.web3.Keypair;
  let authorSolAddress: anchor.web3.Keypair;
  let uploaderSolAddress: anchor.web3.Keypair;


//   before(async () => {
//     // 创建测试账户
   


//     // uploader = anchor.web3.Keypair.generate();
//     // authorSolAddress = anchor.web3.Keypair.generate();
//     // uploaderSolAddress = anchor.web3.Keypair.generate();

//     // 给测试账户充值
// //     const signature1 = await provider.connection.requestAirdrop(
// //       admin.publicKey,
// //       2 * anchor.web3.LAMPORTS_PER_SOL
// //     );
// //     await provider.connection.confirmTransaction(signature1);

// //     const signature2 = await provider.connection.requestAirdrop(
// //       uploader.publicKey,
// //       2 * anchor.web3.LAMPORTS_PER_SOL
// //     );
// //     await provider.connection.confirmTransaction(signature2);
//   });

  it("初始化管理员配置", async () => {

    
    const authority = provider.wallet;

    const [adminConfigPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("admin_config")],
      program.programId
    );

    const tx = await program.methods
      .initializeAdmin()
      .accounts({
        // adminConfig: adminConfigPda,
        admin: authority.publicKey,
        // systemProgram: anchor.web3.SystemProgram.programId,
      })
        .rpc();

    console.log("管理员初始化交易签名:", tx);

    // 验证管理员配置
    const adminConfigAccount = await program.account.adminConfig.fetch(adminConfigPda);
    console.log("管理员列表:", adminConfigAccount.admins.map(a => a.toString()));
  });

});
