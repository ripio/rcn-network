pragma solidity ^0.5.0;


/**
    @dev Defines the interface of a standard RCN cosigner.

    The cosigner is an agent that gives an insurance to the lender in the event of a defaulted loan, the confitions
    of the insurance and the cost of the given are defined by the cosigner.

    The lender will decide what cosigner to use, if any; the address of the cosigner and the valid data provided by the
    agent should be passed as params when the lender calls the "lend" method on the loanManager.

    When the default conditions defined by the cosigner aligns with the status of the loan, the lender of the loan
    should be able to call the "claim" method to receive the benefit; the cosigner can define aditional requirements to
    call this method, like the transfer of the ownership of the loan.
*/
contract Cosigner {
    uint256 public constant VERSION = 3;

    event SetUrl(
        string _url
    );

    event Cosign(
        address _loanManager,
        bytes32 indexed _loanId,
        address _signer,
        bytes _data,
        bytes _oracleData
    );

    event Claim(
        address _loanManager,
        bytes32 indexed _loanId,
        address _sender,
        uint256 _claimAmount,
        bytes _oracleData
    );

    /**
        @return the url of the endpoint that exposes the insurance offers.
    */
    function url() external view returns (string memory);

    /**
        @dev Retrieves the cost of a given insurance, this amount should be exact.

        @return the cost of the cosign, in RCN wei
    */
    function cost(
        address _loanManager,
        bytes32 _loanId,
        bytes calldata _data,
        bytes calldata _oracleData
    )
        external view returns (uint256);

    /**
        @dev The loanManager calls this method for confirmation of the conditions, if the cosigner accepts the liability of
        the insurance it must call the method "cosign" of the loanManager. If the cosigner does not call that method, or
        does not return true to this method, the operation fails.

        @return true if the cosigner accepts the liability
    */
    function requestCosign(
        address _loanManager,
        bytes32 _loanId,
        bytes calldata _data,
        bytes calldata _oracleData
    )
        external returns (bool);

    /**
        @dev Claims the benefit of the insurance if the loan is defaulted, this method should be only calleable by the
        current lender of the loan.

        @return true if the claim was done correctly.
    */
    function claim(
        address _loanManager,
        bytes32 _loanId,
        bytes calldata _oracleData
    )
        external returns (bool);
}