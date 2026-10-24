import { expect } from "chai";
import { ethers } from "hardhat";
import { DeliveryProofRegistry } from "../typechain-types";

describe("DeliveryProofRegistry", function () {
  let registry: DeliveryProofRegistry;
  let owner: ReturnType<typeof ethers.provider.getSigner> extends Promise<infer T> ? T : never;
  let authorizedCaller: Awaited<ReturnType<typeof ethers.getSigner>>;
  let unauthorizedCaller: Awaited<ReturnType<typeof ethers.getSigner>>;

  const DELIVERY_ID = "d1e2f3a4-b5c6-7890-abcd-ef1234567890";
  const PAYLOAD_HASH = ethers.keccak256(ethers.toUtf8Bytes("test-payload-canonical"));

  beforeEach(async function () {
    const signers = await ethers.getSigners();
    owner = signers[0];
    authorizedCaller = signers[1];
    unauthorizedCaller = signers[2];

    const Factory = await ethers.getContractFactory("DeliveryProofRegistry", owner);
    registry = await Factory.deploy([authorizedCaller.address]);
    await registry.waitForDeployment();
  });

  // ─── Deployment ─────────────────────────────────────────────────────────

  describe("Deployment", function () {
    it("should set the deployer as owner", async function () {
      expect(await registry.owner()).to.equal(owner.address);
    });

    it("should authorize the owner by default", async function () {
      expect(await registry.authorized(owner.address)).to.be.true;
    });

    it("should authorize addresses passed in constructor", async function () {
      expect(await registry.authorized(authorizedCaller.address)).to.be.true;
    });

    it("should NOT authorize random addresses", async function () {
      expect(await registry.authorized(unauthorizedCaller.address)).to.be.false;
    });
  });

  // ─── Proof Registration ──────────────────────────────────────────────────

  describe("registerProof", function () {
    it("should register a valid proof", async function () {
      const tx = await registry
        .connect(authorizedCaller)
        .registerProof(DELIVERY_ID, PAYLOAD_HASH);

      await expect(tx)
        .to.emit(registry, "ProofRegistered")
        .withArgs(DELIVERY_ID, PAYLOAD_HASH, authorizedCaller.address, await getTimestamp(tx));
    });

    it("should store the proof correctly", async function () {
      await registry.connect(owner).registerProof(DELIVERY_ID, PAYLOAD_HASH);
      const entry = await registry.getProof(DELIVERY_ID);

      expect(entry.proofHash).to.equal(PAYLOAD_HASH);
      expect(entry.submittedBy).to.equal(owner.address);
      expect(entry.exists).to.be.true;
      expect(entry.status).to.equal(0); // Pending
    });

    it("should revert if delivery ID is empty", async function () {
      await expect(
        registry.connect(owner).registerProof("", PAYLOAD_HASH)
      ).to.be.revertedWithCustomError(registry, "InvalidDeliveryId");
    });

    it("should revert if hash is zero", async function () {
      await expect(
        registry.connect(owner).registerProof(DELIVERY_ID, ethers.ZeroHash)
      ).to.be.revertedWithCustomError(registry, "InvalidHash");
    });

    it("should revert on duplicate registration", async function () {
      await registry.connect(owner).registerProof(DELIVERY_ID, PAYLOAD_HASH);
      await expect(
        registry.connect(owner).registerProof(DELIVERY_ID, PAYLOAD_HASH)
      ).to.be.revertedWithCustomError(registry, "AlreadyRegistered");
    });

    it("should revert for unauthorized callers", async function () {
      await expect(
        registry.connect(unauthorizedCaller).registerProof(DELIVERY_ID, PAYLOAD_HASH)
      ).to.be.revertedWithCustomError(registry, "Unauthorized");
    });
  });

  // ─── Proof Verification ──────────────────────────────────────────────────

  describe("verifyProof", function () {
    beforeEach(async function () {
      await registry.connect(owner).registerProof(DELIVERY_ID, PAYLOAD_HASH);
    });

    it("should return true for matching hash", async function () {
      const [matches] = await registry.verifyProof(DELIVERY_ID, PAYLOAD_HASH);
      expect(matches).to.be.true;
    });

    it("should return false for mismatched hash", async function () {
      const wrongHash = ethers.keccak256(ethers.toUtf8Bytes("wrong-payload"));
      const [matches] = await registry.verifyProof(DELIVERY_ID, wrongHash);
      expect(matches).to.be.false;
    });

    it("should revert for non-existent delivery", async function () {
      await expect(
        registry.verifyProof("non-existent-id", PAYLOAD_HASH)
      ).to.be.revertedWithCustomError(registry, "ProofNotFound");
    });

    it("should return the full entry on verification", async function () {
      const [, entry] = await registry.verifyProof(DELIVERY_ID, PAYLOAD_HASH);
      expect(entry.proofHash).to.equal(PAYLOAD_HASH);
      expect(entry.exists).to.be.true;
    });
  });

  // ─── proofExists ─────────────────────────────────────────────────────────

  describe("proofExists", function () {
    it("should return false for unregistered delivery", async function () {
      expect(await registry.proofExists("unknown-id")).to.be.false;
    });

    it("should return true after registration", async function () {
      await registry.connect(owner).registerProof(DELIVERY_ID, PAYLOAD_HASH);
      expect(await registry.proofExists(DELIVERY_ID)).to.be.true;
    });
  });

  // ─── Status Updates ──────────────────────────────────────────────────────

  describe("updateProofStatus", function () {
    beforeEach(async function () {
      await registry.connect(owner).registerProof(DELIVERY_ID, PAYLOAD_HASH);
    });

    it("should update status to Approved", async function () {
      const tx = await registry.connect(owner).updateProofStatus(DELIVERY_ID, 1);
      const entry = await registry.getProof(DELIVERY_ID);
      expect(entry.status).to.equal(1);
      await expect(tx).to.emit(registry, "ProofStatusUpdated");
    });

    it("should update status to Rejected", async function () {
      await registry.connect(owner).updateProofStatus(DELIVERY_ID, 2);
      const entry = await registry.getProof(DELIVERY_ID);
      expect(entry.status).to.equal(2);
    });

    it("should revert for unauthorized callers", async function () {
      await expect(
        registry.connect(unauthorizedCaller).updateProofStatus(DELIVERY_ID, 1)
      ).to.be.revertedWithCustomError(registry, "Unauthorized");
    });

    it("should revert for non-existent delivery", async function () {
      await expect(
        registry.connect(owner).updateProofStatus("no-such-id", 1)
      ).to.be.revertedWithCustomError(registry, "ProofNotFound");
    });
  });

  // ─── Authorization Management ─────────────────────────────────────────────

  describe("Authorization management", function () {
    it("should grant authorization", async function () {
      await registry.connect(owner).grantAuthorization(unauthorizedCaller.address);
      expect(await registry.authorized(unauthorizedCaller.address)).to.be.true;
    });

    it("should revoke authorization", async function () {
      await registry.connect(owner).revokeAuthorization(authorizedCaller.address);
      expect(await registry.authorized(authorizedCaller.address)).to.be.false;

      await expect(
        registry.connect(authorizedCaller).registerProof(DELIVERY_ID, PAYLOAD_HASH)
      ).to.be.revertedWithCustomError(registry, "Unauthorized");
    });

    it("should revert grantAuthorization for non-owner", async function () {
      await expect(
        registry
          .connect(authorizedCaller)
          .grantAuthorization(unauthorizedCaller.address)
      ).to.be.revertedWithCustomError(registry, "Unauthorized");
    });

    it("should revert grant for zero address", async function () {
      await expect(
        registry.connect(owner).grantAuthorization(ethers.ZeroAddress)
      ).to.be.revertedWithCustomError(registry, "ZeroAddressNotAllowed");
    });

    it("should transfer ownership", async function () {
      await registry.connect(owner).transferOwnership(authorizedCaller.address);
      expect(await registry.owner()).to.equal(authorizedCaller.address);
    });

    it("should revert ownership transfer for non-owner", async function () {
      await expect(
        registry.connect(authorizedCaller).transferOwnership(unauthorizedCaller.address)
      ).to.be.revertedWithCustomError(registry, "Unauthorized");
    });
  });

  // ─── Helpers ─────────────────────────────────────────────────────────────

  async function getTimestamp(
    tx: Awaited<ReturnType<typeof registry.registerProof>>
  ): Promise<number> {
    const receipt = await tx.wait();
    const block = await ethers.provider.getBlock(receipt!.blockNumber);
    return block!.timestamp;
  }
});
