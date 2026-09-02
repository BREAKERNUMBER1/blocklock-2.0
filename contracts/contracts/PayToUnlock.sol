// SPDX-License-Identifier: MIT
pragma solidity 0.8.25;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * Pay-per-unlock contract for BlockLock-LitVM.
 * Anyone can call unlock() with >= unlockPriceWei of native zkLTC;
 * the payment is split 90/10 between treasury and operationsFund atomically.
 * No NFT or token ownership is required — payment is the only gate.
 */
contract PayToUnlock is Ownable, ReentrancyGuard {
    uint256 public unlockPriceWei;
    address public treasury;
    address public operationsFund;

    event Unlocked(address indexed payer, string doorId, uint256 amount, uint256 timestamp);
    event PriceUpdated(uint256 newPriceWei);
    event TreasuryUpdated(address newTreasury);
    event OperationsFundUpdated(address newOperationsFund);

    constructor(uint256 _initialPriceWei, address _treasury, address _operationsFund)
        Ownable(msg.sender)
    {
        require(_treasury != address(0), "Treasury cannot be zero address");
        require(_operationsFund != address(0), "Operations fund cannot be zero address");
        unlockPriceWei = _initialPriceWei;
        treasury = _treasury;
        operationsFund = _operationsFund;
    }

    function unlock(string calldata doorId) external payable nonReentrant {
        require(msg.value >= unlockPriceWei, "Payment below unlock price");

        uint256 operationsCut = (msg.value * 10) / 100;
        uint256 treasuryCut = msg.value - operationsCut;

        (bool okO, ) = operationsFund.call{value: operationsCut}("");
        require(okO, "Operations fund transfer failed");
        (bool okT, ) = treasury.call{value: treasuryCut}("");
        require(okT, "Treasury transfer failed");

        emit Unlocked(msg.sender, doorId, msg.value, block.timestamp);
    }

    function setUnlockPrice(uint256 newPriceWei) external onlyOwner {
        unlockPriceWei = newPriceWei;
        emit PriceUpdated(newPriceWei);
    }

    function setTreasury(address newTreasury) external onlyOwner {
        require(newTreasury != address(0), "Treasury cannot be zero address");
        treasury = newTreasury;
        emit TreasuryUpdated(newTreasury);
    }

    function setOperationsFund(address newOperationsFund) external onlyOwner {
        require(newOperationsFund != address(0), "Operations fund cannot be zero address");
        operationsFund = newOperationsFund;
        emit OperationsFundUpdated(newOperationsFund);
    }
}
