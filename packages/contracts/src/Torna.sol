// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import { AccessControl } from "@openzeppelin/contracts/access/AccessControl.sol";
import { IERC20Metadata } from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { IERC20Permit } from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Permit.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import { SafeCast } from "@openzeppelin/contracts/utils/math/SafeCast.sol";
import { Math } from "@openzeppelin/contracts/utils/math/Math.sol";
import { ECDSA } from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import { EIP712 } from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import { TornaEvents } from "./TornaEvents.sol";
import { Limits } from "./libraries/Limits.sol";
import {
    AdvanceRequest,
    Position,
    PositionState,
    IssuerState,
    AdvanceRejection,
    DepositRejection,
    IssuerRegistration,
    CollateralDepositRequest,
    RepaymentRequest,
    PermitSignature,
    InvalidAddress,
    InvalidAsset,
    InvalidAssetDecimals
} from "./TornaTypes.sol";

/// @notice Local PoC: initial liquidity, collateral, signed advances and full repayments.
contract Torna is AccessControl, EIP712, TornaEvents, ReentrancyGuard {
    using SafeERC20 for IERC20;

    error BootstrapAlreadyConfigured();
    error BootstrapNotConfigured();
    error InvalidBootstrapLP(address lp);
    error BootstrapClosed();
    error BootstrapAlreadyDeposited(address lp);
    error InvalidBootstrapAmount(uint256 expected, uint256 actual);
    error LiquidityNotReady();
    error InvalidLiquidityAmount();
    error PoolDepositCapExceeded();
    error UnexpectedTokenReceipt(uint256 expected, uint256 actual);
    error IssuerAlreadyRegistered(address issuer);
    error UnregisteredIssuer(address issuer);
    error InvalidIssuerMetadata();
    error InvalidCollateralAmount();
    error CollateralAuthorizationExpired(uint256 deadline);
    error InvalidCollateralNonce(uint256 expected, uint256 actual);
    error InvalidCollateralSigner(address signer, address issuer);
    error InsufficientCollateralAllowance(uint256 available, uint256 required);
    error UnknownPosition(bytes32 refundKey);
    error InvalidAdvanceRequest();
    error InvalidAdvanceNonce(uint256 expected, uint256 actual);
    error AcquirerMismatch(bytes32 expected, bytes32 actual);
    error InsufficientPoolCash(uint256 available, uint256 required);
    error InsufficientFeeAllowance(uint256 available, uint256 required);
    error UnexpectedTokenPayment(uint256 expected, uint256 debited, uint256 received);
    error InsufficientAssetBacking(uint256 actual, uint256 required);
    error InvalidRepaymentState(bytes32 refundKey, PositionState state);
    error RepaymentIssuerMismatch(address expected, address actual);
    error RepaymentAmountMismatch(uint256 expected, uint256 actual);
    error RepaymentAuthorizationExpired(uint256 deadline);
    error InvalidRepaymentNonce(uint256 expected, uint256 actual);
    error InvalidRepaymentSigner(address signer, address issuer);
    error InsufficientRepaymentAllowance(uint256 available, uint256 required);
    error ReserveAlreadySeeded();
    error InvalidReserveSeedAmount(uint256 expected, uint256 actual);
    error InsufficientReserveSeedAllowance(uint256 available, uint256 required);

    event InitialLiquidityConfigured(address[3] lps);
    event InitialLiquidityCompleted(uint256 totalPrincipal);

    uint256 public constant INITIAL_LIQUIDITY = 10_000e6;
    uint256 public constant RESERVE_SEED = 500e6;
    uint256 public constant ISSUER_RAMP_PERIOD = 30 days;
    uint256 public constant ADVANCE_FEE_BPS = 30;
    uint256 public constant LP_FEE_BPS = 8000;
    uint256 public constant RESERVE_FEE_BPS = 1330;
    mapping(address => IssuerRegistration) private _issuerRegistrations;
    mapping(address => uint256) public collateralOf;
    mapping(address => uint256) public collateralDepositNonces;
    uint256 public totalCollateral;
    bool public initialLiquidityConfigured;
    bool public initialLiquidityComplete;
    mapping(address => uint256) public initialLiquidityAllocation;
    mapping(address => bool) public initialLiquidityDeposited;
    mapping(address => uint256) public lpPrincipal;
    uint256 public totalLpPrincipal;
    // All registered issuers count, including zero-collateral issuers. No removal path yet.
    uint256 public registeredIssuerCount;
    mapping(address => uint256) public advanceNonces;
    mapping(address => uint256) public repaymentNonces;
    mapping(bytes32 => Position) private _positions;
    mapping(address => uint256) public issuerOutstanding;
    mapping(bytes32 => uint256) public acquirerOutstanding;
    uint256 public totalOutstanding;
    uint256 public totalLpFees;
    uint256 public reserveBalance;
    bool public reserveSeeded;
    uint256 public protocolFees;
    uint256 public totalAdvanceCount;
    uint256 public totalAdvanced;
    bytes32 public constant VERIFIER_ROLE = keccak256("VERIFIER_ROLE");
    bytes32 public constant SUBMITTER_ROLE = keccak256("SUBMITTER_ROLE");
    bytes32 public constant ADVANCE_REQUEST_TYPEHASH = keccak256(
        "AdvanceRequest(bytes32 refundKey,address issuer,bytes32 acquirerHash,uint256 amount,uint64 maturity,uint256 nonce,uint256 deadline)"
    );
    bytes32 public constant COLLATERAL_DEPOSIT_TYPEHASH = keccak256(
        "CollateralDepositRequest(address issuer,uint256 amount,uint256 nonce,uint256 deadline)"
    );
    bytes32 public constant REPAYMENT_REQUEST_TYPEHASH = keccak256(
        "RepaymentRequest(bytes32 refundKey,address issuer,uint256 amount,uint256 nonce,uint256 deadline)"
    );

    // Keep the conventional asset() query name in the public interface.
    // forge-lint: disable-next-line(screaming-snake-case-immutable)
    IERC20Metadata public immutable asset;

    constructor(IERC20Metadata asset_, address admin, address verifier, address submitter)
        EIP712("Torna", "1")
    {
        if (admin == address(0) || verifier == address(0) || submitter == address(0)) {
            revert InvalidAddress();
        }
        if (address(asset_).code.length == 0) revert InvalidAsset(address(asset_));
        uint8 decimals_ = asset_.decimals();
        if (decimals_ != 6) revert InvalidAssetDecimals(decimals_);
        asset = asset_;
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(VERIFIER_ROLE, verifier);
        _grantRole(SUBMITTER_ROLE, submitter);
    }

    /// @dev Initial LP funding must finish before any advance can execute.
    modifier whenLiquidityReady() {
        if (!initialLiquidityComplete) revert LiquidityNotReady();
        _;
    }

    /// @notice Admin registers a company at the current block time. No backdating or reset.
    function registerIssuer(address issuer, bytes32 acquirerHash, string calldata name)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        if (issuer == address(0) || issuer == address(this)) revert InvalidAddress();
        if (_issuerRegistrations[issuer].exists) revert IssuerAlreadyRegistered(issuer);
        if (acquirerHash == bytes32(0) || bytes(name).length == 0) revert InvalidIssuerMetadata();
        _issuerRegistrations[issuer] = IssuerRegistration({
            exists: true,
            registeredAt: SafeCast.toUint64(block.timestamp),
            acquirerHash: acquirerHash,
            name: name
        });
        registeredIssuerCount += 1;
        emit IssuerRegistered(issuer, acquirerHash, name);
    }

    /// @notice Metadata only, not a claim that the issuer is funded or allowed to advance.
    function issuerRegistrationOf(address issuer) public view returns (IssuerRegistration memory) {
        if (!_issuerRegistrations[issuer].exists) revert UnregisteredIssuer(issuer);
        return _issuerRegistrations[issuer];
    }

    /// @notice The first 30 days are restricted; exactly registeredAt + 30 days is unrestricted.
    function isIssuerRamping(address issuer) public view returns (bool) {
        IssuerRegistration memory registration = issuerRegistrationOf(issuer);
        return block.timestamp < uint256(registration.registeredAt) + ISSUER_RAMP_PERIOD;
    }

    /// @notice Diagnostic calculation on supplied balances/count, NOT spendable on-chain credit.
    /// @dev Execution uses issuerLimit instead. This helper never grants spendable credit.
    function previewIssuerLimit(
        address issuer,
        uint256 collateral,
        uint256 suppliedPoolCapacity,
        uint256 issuerCount
    ) external view returns (uint256) {
        return Limits.effectiveLimit(
            collateral, suppliedPoolCapacity, issuerCount, isIssuerRamping(issuer)
        );
    }

    /// @notice Current LP capacity. External deployment, losses and withdrawals are not enabled.
    /// @dev Collateral, reserve, protocol fees and direct token donations are NOT LP assets.
    function poolCapacity() public view returns (uint256) {
        return totalLpPrincipal + totalLpFees;
    }

    function poolCash() public view returns (uint256) {
        return Limits.remaining(poolCapacity(), totalOutstanding);
    }

    /// @notice Limit sourced from actual stored accounting, not caller-supplied balances.
    function issuerLimit(address issuer) public view returns (uint256) {
        return Limits.effectiveLimit(
            collateralOf[issuer], poolCapacity(), registeredIssuerCount, isIssuerRamping(issuer)
        );
    }

    /// @notice Balance-derived status only; administrative suspension/removal is not enabled.
    function issuerStateOf(address issuer) public view returns (IssuerState) {
        issuerRegistrationOf(issuer);
        uint256 collateral = collateralOf[issuer];
        if (collateral == 0) return IssuerState.Suspended;
        uint256 required = Math.mulDiv(issuerOutstanding[issuer], 1500, 10_000, Math.Rounding.Ceil);
        return required > collateral ? IssuerState.MarginCall : IssuerState.Active;
    }

    function positionOf(bytes32 refundKey) external view returns (Position memory) {
        if (!_positions[refundKey].exists) revert UnknownPosition(refundKey);
        return _positions[refundKey];
    }

    /// @notice PRD: 0.3% fee, split 80% / 13.3% / 6.7%.
    /// @dev Floor total/LP/reserve to base units; protocol takes the residual (no lost dust).
    function quoteAdvanceFee(uint256 amount)
        public
        pure
        returns (uint256 fee, uint256 lpFee, uint256 reserveFee, uint256 protocolFee)
    {
        fee = Math.mulDiv(amount, ADVANCE_FEE_BPS, 10_000);
        lpFee = Math.mulDiv(fee, LP_FEE_BPS, 10_000);
        reserveFee = Math.mulDiv(fee, RESERVE_FEE_BPS, 10_000);
        protocolFee = fee - lpFee - reserveFee;
    }

    /// @notice Admin seeds the fixed PRD reserve before scenario execution.
    function seedReserve(uint256 amount) external onlyRole(DEFAULT_ADMIN_ROLE) nonReentrant {
        if (reserveSeeded) revert ReserveAlreadySeeded();
        if (amount != RESERVE_SEED) revert InvalidReserveSeedAmount(RESERVE_SEED, amount);
        uint256 allowance = asset.allowance(msg.sender, address(this));
        if (allowance < amount) revert InsufficientReserveSeedAllowance(allowance, amount);
        uint256 beforeBalance = asset.balanceOf(address(this));
        IERC20(address(asset)).safeTransferFrom(msg.sender, address(this), amount);
        uint256 afterBalance = asset.balanceOf(address(this));
        uint256 received = afterBalance >= beforeBalance ? afterBalance - beforeBalance : 0;
        if (received != amount) revert UnexpectedTokenReceipt(amount, received);
        reserveBalance += amount;
        reserveSeeded = true;
        emit ReserveSeeded(amount);
    }

    /// @notice Submit an issuer-signed advance using existing fee allowance.
    /// @return issued False plus AdvanceRejected means no issuance, despite a successful receipt.
    function advance(AdvanceRequest calldata request, bytes calldata signature)
        external
        onlyRole(SUBMITTER_ROLE)
        whenLiquidityReady
        nonReentrant
        returns (bool issued)
    {
        if (!_acceptAdvance(request, signature)) return false;
        _issueAdvance(request);
        return true;
    }

    /// @notice Permit authorizes ONLY the fee; principal is paid in full to the signed issuer.
    function advanceWithPermit(
        AdvanceRequest calldata request,
        bytes calldata signature,
        PermitSignature calldata permitSignature
    ) external onlyRole(SUBMITTER_ROLE) whenLiquidityReady nonReentrant returns (bool issued) {
        // No permit or nonce is consumed on business rejection.
        if (!_acceptAdvance(request, signature)) return false;
        (uint256 fee,,,) = quoteAdvanceFee(request.amount);
        if (fee != 0) {
            try IERC20Permit(address(asset))
                .permit(
                    request.issuer,
                    address(this),
                    fee,
                    permitSignature.deadline,
                    permitSignature.v,
                    permitSignature.r,
                    permitSignature.s
                ) { }
                catch { }
        }
        _issueAdvance(request);
        return true;
    }

    function _acceptAdvance(AdvanceRequest calldata request, bytes calldata signature)
        private
        returns (bool)
    {
        AdvanceRejection reason = _advanceRejection(request, signature);
        if (reason == AdvanceRejection.None) return true;
        emit AdvanceRejected(request.refundKey, uint8(reason));
        return false;
    }

    function _issueAdvance(AdvanceRequest calldata request) private {
        uint256 backing = poolCash() + totalCollateral + reserveBalance + protocolFees;
        uint256 actual = asset.balanceOf(address(this));
        if (actual < backing) revert InsufficientAssetBacking(actual, backing);
        (uint256 fee, uint256 lpFee, uint256 reserveFee, uint256 protocolFee) =
            quoteAdvanceFee(request.amount);
        if (fee != 0) _receiveAdvanceFee(request.issuer, fee);

        advanceNonces[request.issuer] += 1;
        uint256 margin = Math.mulDiv(request.amount, 2000, 10_000);
        _positions[request.refundKey] = Position({
            exists: true,
            issuer: request.issuer,
            acquirerHash: request.acquirerHash,
            amount: request.amount,
            fee: fee,
            issuerMargin: margin,
            poolCoverage: request.amount - margin,
            maturity: request.maturity,
            termsVersion: 1,
            state: PositionState.Advanced
        });
        issuerOutstanding[request.issuer] += request.amount;
        acquirerOutstanding[request.acquirerHash] += request.amount;
        totalOutstanding += request.amount;
        totalLpFees += lpFee;
        reserveBalance += reserveFee;
        protocolFees += protocolFee;
        totalAdvanceCount += 1;
        totalAdvanced += request.amount;

        // A failed payment reverts the fee transfer, permit, nonce, position and all accounting.
        _payAdvance(request.issuer, request.amount);
        emit AdvanceIssued(request.refundKey, request.issuer, request.amount, request.maturity);
    }

    function _receiveAdvanceFee(address issuer, uint256 fee) private {
        uint256 allowance = asset.allowance(issuer, address(this));
        if (allowance < fee) revert InsufficientFeeAllowance(allowance, fee);
        uint256 beforeBalance = asset.balanceOf(address(this));
        IERC20(address(asset)).safeTransferFrom(issuer, address(this), fee);
        uint256 afterBalance = asset.balanceOf(address(this));
        uint256 received = afterBalance >= beforeBalance ? afterBalance - beforeBalance : 0;
        if (received != fee) revert UnexpectedTokenReceipt(fee, received);
    }

    function _payAdvance(address issuer, uint256 amount) private {
        uint256 beforePool = asset.balanceOf(address(this));
        uint256 beforeIssuer = asset.balanceOf(issuer);
        IERC20(address(asset)).safeTransfer(issuer, amount);
        uint256 afterPool = asset.balanceOf(address(this));
        uint256 afterIssuer = asset.balanceOf(issuer);
        uint256 debited = beforePool >= afterPool ? beforePool - afterPool : 0;
        uint256 received = afterIssuer >= beforeIssuer ? afterIssuer - beforeIssuer : 0;
        if (debited != amount || received != amount) {
            revert UnexpectedTokenPayment(amount, debited, received);
        }
    }

    /// @notice Repay one Advanced position in full using an existing token allowance.
    /// @dev Partial repayment is intentionally not introduced while PRD decision D05 is open.
    function repay(RepaymentRequest calldata request, bytes calldata signature)
        external
        onlyRole(SUBMITTER_ROLE)
        nonReentrant
    {
        _consumeRepaymentAuthorization(request, signature);
        _receiveRepayment(request.issuer, request.amount);
        _recordRepayment(request);
    }

    /// @notice Approve the exact principal and repay it in one relayer transaction.
    function repayWithPermit(
        RepaymentRequest calldata request,
        bytes calldata signature,
        PermitSignature calldata permitSignature
    ) external onlyRole(SUBMITTER_ROLE) nonReentrant {
        _consumeRepaymentAuthorization(request, signature);
        // A third party may already have relayed the permit. The independent repayment
        // signature and the exact allowance check remain mandatory when permit fails.
        try IERC20Permit(address(asset))
            .permit(
                request.issuer,
                address(this),
                request.amount,
                permitSignature.deadline,
                permitSignature.v,
                permitSignature.r,
                permitSignature.s
            ) { }
            catch { }
        _receiveRepayment(request.issuer, request.amount);
        _recordRepayment(request);
    }

    /// @notice Digest for an issuer's full-principal repayment authorization.
    function hashRepaymentRequest(RepaymentRequest calldata request) public view returns (bytes32) {
        return _hashTypedDataV4(
            keccak256(
                abi.encode(
                    REPAYMENT_REQUEST_TYPEHASH,
                    request.refundKey,
                    request.issuer,
                    request.amount,
                    request.nonce,
                    request.deadline
                )
            )
        );
    }

    function _consumeRepaymentAuthorization(
        RepaymentRequest calldata request,
        bytes calldata signature
    ) private {
        Position storage position = _positions[request.refundKey];
        if (!position.exists) revert UnknownPosition(request.refundKey);
        if (position.state != PositionState.Advanced) {
            revert InvalidRepaymentState(request.refundKey, position.state);
        }
        if (request.issuer != position.issuer) {
            revert RepaymentIssuerMismatch(position.issuer, request.issuer);
        }
        if (request.amount != position.amount) {
            revert RepaymentAmountMismatch(position.amount, request.amount);
        }
        if (block.timestamp > request.deadline) {
            revert RepaymentAuthorizationExpired(request.deadline);
        }
        uint256 nonce = repaymentNonces[request.issuer];
        if (request.nonce != nonce) revert InvalidRepaymentNonce(nonce, request.nonce);
        address signer = ECDSA.recover(hashRepaymentRequest(request), signature);
        if (signer != request.issuer) revert InvalidRepaymentSigner(signer, request.issuer);
        repaymentNonces[request.issuer] = nonce + 1;
    }

    function _receiveRepayment(address issuer, uint256 amount) private {
        uint256 allowance = asset.allowance(issuer, address(this));
        if (allowance < amount) revert InsufficientRepaymentAllowance(allowance, amount);
        uint256 beforePool = asset.balanceOf(address(this));
        uint256 beforeIssuer = asset.balanceOf(issuer);
        IERC20(address(asset)).safeTransferFrom(issuer, address(this), amount);
        uint256 afterPool = asset.balanceOf(address(this));
        uint256 afterIssuer = asset.balanceOf(issuer);
        uint256 debited = beforeIssuer >= afterIssuer ? beforeIssuer - afterIssuer : 0;
        uint256 received = afterPool >= beforePool ? afterPool - beforePool : 0;
        if (debited != amount || received != amount) {
            revert UnexpectedTokenPayment(amount, debited, received);
        }
    }

    function _recordRepayment(RepaymentRequest calldata request) private {
        Position storage position = _positions[request.refundKey];
        position.state = PositionState.Repaid;
        issuerOutstanding[request.issuer] -= request.amount;
        acquirerOutstanding[position.acquirerHash] -= request.amount;
        totalOutstanding -= request.amount;

        uint256 required = poolCash() + totalCollateral + reserveBalance + protocolFees;
        uint256 actual = asset.balanceOf(address(this));
        if (actual < required) revert InsufficientAssetBacking(actual, required);
        emit AdvanceRepaid(request.refundKey, request.amount);
    }

    /// @dev Business rejections retain the PRD event codes; malformed signed input reverts.
    function _advanceRejection(AdvanceRequest calldata request, bytes calldata signature)
        private
        view
        returns (AdvanceRejection)
    {
        if (_positions[request.refundKey].exists) {
            return AdvanceRejection.DuplicateRefundKey;
        }
        if (!_issuerRegistrations[request.issuer].exists) {
            return AdvanceRejection.UnregisteredIssuer;
        }
        if (block.timestamp > request.deadline) return AdvanceRejection.DeadlineExpired;
        (address signer, ECDSA.RecoverError error,) =
            ECDSA.tryRecover(hashAdvanceRequest(request), signature);
        // The payload has no explicit domain fields; a wrong chain/contract also fails here.
        if (error != ECDSA.RecoverError.NoError || signer != request.issuer) {
            return AdvanceRejection.InvalidSignature;
        }
        uint256 nonce = advanceNonces[request.issuer];
        if (request.nonce != nonce) revert InvalidAdvanceNonce(nonce, request.nonce);
        if (
            request.refundKey == bytes32(0) || request.amount == 0
                || request.maturity <= block.timestamp
        ) {
            revert InvalidAdvanceRequest();
        }
        bytes32 acquirer = _issuerRegistrations[request.issuer].acquirerHash;
        if (request.acquirerHash != acquirer) {
            revert AcquirerMismatch(acquirer, request.acquirerHash);
        }
        if (issuerStateOf(request.issuer) == IssuerState.Suspended) {
            return AdvanceRejection.IssuerSuspended;
        }
        if (
            request.amount
                > Limits.remaining(issuerLimit(request.issuer), issuerOutstanding[request.issuer])
        ) {
            return AdvanceRejection.IssuerLimitExceeded;
        }
        if (request.amount > Limits.acquirerRoom(poolCapacity(), acquirerOutstanding[acquirer])) {
            return AdvanceRejection.AcquirerExposureExceeded;
        }
        uint256 cash = poolCash();
        if (request.amount > cash) revert InsufficientPoolCash(cash, request.amount);
        return AdvanceRejection.None;
    }

    /// @notice Relayed, signed deposit using an allowance that already exists.
    function depositCollateral(CollateralDepositRequest calldata request, bytes calldata signature)
        external
        onlyRole(SUBMITTER_ROLE)
        nonReentrant
    {
        _consumeCollateralAuthorization(request, signature);
        _receiveCollateral(request.issuer, request.amount);
    }

    /// @notice Approve and deposit in one relayer transaction; issuer sends no transaction.
    function depositCollateralWithPermit(
        CollateralDepositRequest calldata request,
        bytes calldata signature,
        PermitSignature calldata permitSignature
    ) external onlyRole(SUBMITTER_ROLE) nonReentrant {
        // A permit only grants allowance; this independent signature authorizes the deposit.
        _consumeCollateralAuthorization(request, signature);
        // A third party may have relayed this permit already. The signed action remains required,
        // and _receiveCollateral checks allowance even when permit fails.
        try IERC20Permit(address(asset))
            .permit(
                request.issuer,
                address(this),
                request.amount,
                permitSignature.deadline,
                permitSignature.v,
                permitSignature.r,
                permitSignature.s
            ) { }
            catch { }
        _receiveCollateral(request.issuer, request.amount);
    }

    /// @notice Digest for an issuer's collateral action, using the Torna EIP-712 domain.
    function hashCollateralDeposit(CollateralDepositRequest calldata request)
        public
        view
        returns (bytes32)
    {
        return _hashTypedDataV4(
            keccak256(
                abi.encode(
                    COLLATERAL_DEPOSIT_TYPEHASH,
                    request.issuer,
                    request.amount,
                    request.nonce,
                    request.deadline
                )
            )
        );
    }

    function _consumeCollateralAuthorization(
        CollateralDepositRequest calldata request,
        bytes calldata signature
    ) private {
        if (!_issuerRegistrations[request.issuer].exists) revert UnregisteredIssuer(request.issuer);
        if (request.amount == 0) revert InvalidCollateralAmount();
        if (block.timestamp > request.deadline) {
            revert CollateralAuthorizationExpired(request.deadline);
        }
        uint256 nonce = collateralDepositNonces[request.issuer];
        if (request.nonce != nonce) revert InvalidCollateralNonce(nonce, request.nonce);
        address signer = ECDSA.recover(hashCollateralDeposit(request), signature);
        if (signer != request.issuer) revert InvalidCollateralSigner(signer, request.issuer);
        collateralDepositNonces[request.issuer] = nonce + 1;
    }

    function _receiveCollateral(address issuer, uint256 amount) private {
        uint256 allowance = asset.allowance(issuer, address(this));
        if (allowance < amount) revert InsufficientCollateralAllowance(allowance, amount);
        uint256 balanceBefore = asset.balanceOf(address(this));
        IERC20(address(asset)).safeTransferFrom(issuer, address(this), amount);
        uint256 balanceAfter = asset.balanceOf(address(this));
        uint256 received = balanceAfter >= balanceBefore ? balanceAfter - balanceBefore : 0;
        if (received != amount) revert UnexpectedTokenReceipt(amount, received);
        // Credit only the token owner, only after exact receipt. LP principal is separate.
        collateralOf[issuer] += amount;
        totalCollateral += amount;
        emit CollateralDeposited(issuer, amount);
    }

    /// @notice Fix LP-01/02/03 before funding. No replacement or reopening, even by admin.
    function configureInitialLiquidity(address[3] calldata lps)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        if (initialLiquidityConfigured) revert BootstrapAlreadyConfigured();
        for (uint256 i; i < lps.length; ++i) {
            address lp = lps[i];
            if (lp == address(0) || lp == address(this)) revert InvalidBootstrapLP(lp);
            for (uint256 j; j < i; ++j) {
                if (lp == lps[j]) revert InvalidBootstrapLP(lp);
            }
            initialLiquidityAllocation[lp] = i == 0 ? 5000e6 : (i == 1 ? 3000e6 : 2000e6);
        }
        initialLiquidityConfigured = true;
        emit InitialLiquidityConfigured(lps);
    }

    /// @notice D01: only the fixed initial allocations bypass the individual LP cap.
    /// @dev Caller approves and pays its own funds. A failed receipt rolls back all effects.
    function depositInitialLiquidity(uint256 amount) external nonReentrant {
        if (!initialLiquidityConfigured) revert BootstrapNotConfigured();
        if (initialLiquidityComplete) revert BootstrapClosed();
        uint256 allocation = initialLiquidityAllocation[msg.sender];
        if (allocation == 0) revert InvalidBootstrapLP(msg.sender);
        if (initialLiquidityDeposited[msg.sender]) revert BootstrapAlreadyDeposited(msg.sender);
        if (amount != allocation) revert InvalidBootstrapAmount(allocation, amount);
        // No advances are allowed before completion, so outstanding must be zero here.
        uint256 nextPrincipal = totalLpPrincipal + amount;
        if (nextPrincipal > Limits.depositCap(0)) revert PoolDepositCapExceeded();

        initialLiquidityDeposited[msg.sender] = true;
        lpPrincipal[msg.sender] += amount;
        totalLpPrincipal = nextPrincipal;

        uint256 balanceBefore = asset.balanceOf(address(this));
        IERC20(address(asset)).safeTransferFrom(msg.sender, address(this), amount);
        uint256 balanceAfter = asset.balanceOf(address(this));
        uint256 received = balanceAfter >= balanceBefore ? balanceAfter - balanceBefore : 0;
        if (received != amount) revert UnexpectedTokenReceipt(amount, received);

        emit LiquidityDeposited(msg.sender, amount);
        // Set readiness only after the final transfer and exact receipt verification.
        if (nextPrincipal == INITIAL_LIQUIDITY) {
            initialLiquidityComplete = true;
            emit InitialLiquidityCompleted(nextPrincipal);
        }
    }

    /// @notice Deposit LP principal after the fixed bootstrap, accepting only the available room.
    /// @dev The caller pays gas and must approve Torna. Any remainder is not transferred.
    function depositLiquidity(uint256 amount)
        external
        whenLiquidityReady
        nonReentrant
        returns (uint256 accepted)
    {
        if (amount == 0) revert InvalidLiquidityAmount();
        accepted = liquidityDepositRoom(msg.sender);
        if (accepted > amount) accepted = amount;
        if (accepted == 0) {
            emit DepositRejected(msg.sender, amount, uint8(_depositRejectionReason(msg.sender)));
            return 0;
        }

        uint256 balanceBefore = asset.balanceOf(address(this));
        IERC20(address(asset)).safeTransferFrom(msg.sender, address(this), accepted);
        uint256 balanceAfter = asset.balanceOf(address(this));
        uint256 received = balanceAfter >= balanceBefore ? balanceAfter - balanceBefore : 0;
        if (received != accepted) revert UnexpectedTokenReceipt(accepted, received);

        lpPrincipal[msg.sender] += accepted;
        totalLpPrincipal += accepted;
        emit LiquidityDeposited(msg.sender, accepted);
        if (accepted != amount) {
            emit DepositRejected(
                msg.sender, amount - accepted, uint8(_depositRejectionReason(msg.sender))
            );
        }
    }

    /// @notice Maximum additional principal currently accepted for one LP under both PRD caps.
    function liquidityDepositRoom(address lp) public view returns (uint256) {
        return Limits.depositRoom(totalLpPrincipal, lpPrincipal[lp], totalOutstanding);
    }

    function _depositRejectionReason(address lp) private view returns (DepositRejection) {
        uint256 cap = Limits.depositCap(totalOutstanding);
        uint256 poolRoom = Limits.remaining(cap, totalLpPrincipal);
        uint256 individualRoom = Limits.remaining(Math.mulDiv(cap, 2500, 10_000), lpPrincipal[lp]);
        return poolRoom <= individualRoom
            ? DepositRejection.DepositCapExceeded
            : DepositRejection.ConcentrationExceeded;
    }

    /// @notice Diagnostic digest. Does not check authorization, expiry, nonce or uniqueness.
    function hashAdvanceRequest(AdvanceRequest calldata request) public view returns (bytes32) {
        return _hashTypedDataV4(
            keccak256(
                abi.encode(
                    ADVANCE_REQUEST_TYPEHASH,
                    request.refundKey,
                    request.issuer,
                    request.acquirerHash,
                    request.amount,
                    request.maturity,
                    request.nonce,
                    request.deadline
                )
            )
        );
    }

    /// @notice Recovers a signer only; this is not an approval or replay-protection check.
    function recoverAdvanceSigner(AdvanceRequest calldata request, bytes calldata signature)
        external
        view
        returns (address)
    {
        return ECDSA.recover(hashAdvanceRequest(request), signature);
    }
}
