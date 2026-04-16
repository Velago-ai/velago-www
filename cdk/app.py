#!/usr/bin/env python3
"""VelaGo frontend CDK application entry point."""

import os

import aws_cdk as cdk

from stacks.frontend_stack import FrontendStack

app = cdk.App()

env_name = app.node.try_get_context("env") or "staging"
project = app.node.try_get_context("project") or "velago"
region = app.node.try_get_context("aws_region") or "us-east-1"

cdk_env = cdk.Environment(
    account=os.environ.get("CDK_DEFAULT_ACCOUNT"),
    region=region,
)

FrontendStack(app, f"{project}-{env_name}-frontend", env=cdk_env)

app.synth()
