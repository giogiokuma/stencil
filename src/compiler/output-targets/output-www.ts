import * as d from '../../declarations';
import { catchError, flatOne, normalizePath, unique } from '@utils';
import { generateEs5DisabledMessage } from '../app-core/app-es5-disabled';
import { getUsedComponents } from '../html/used-components';
import { inlineEsmImport } from '../html/inline-esm-import';
import { isOutputTargetWww } from './output-utils';
import { optimizeCriticalPath } from '../html/inject-module-preloads';
import { processCopyTasks } from '../copy/local-copy-tasks';
import { performCopyTasks } from '../copy/copy-tasks';
import { updateIndexHtmlServiceWorker } from '../html/inject-sw-script';
import { writeGlobalStyles } from '../style/global-styles';
import { updateGlobalStylesLink } from '../html/update-global-styles-link';
import { getScopeId } from '../style/scope-css';
import { inlineStyleSheets } from '../html/inline-style-sheets';
import { INDEX_ORG } from '../service-worker/generate-sw';


export async function outputWww(config: d.Config, compilerCtx: d.CompilerCtx, buildCtx: d.BuildCtx) {
  const outputTargets = config.outputTargets.filter(isOutputTargetWww);
  if (outputTargets.length === 0) {
    return;
  }

  const timespan = buildCtx.createTimeSpan(`generate www started`, true);
  const criticalBundles = getCriticalPath(buildCtx);

  await Promise.all(
    outputTargets.map(outputTarget => generateWww(config, compilerCtx, buildCtx, criticalBundles, outputTarget))
  );

  timespan.finish(`generate www finished`);
}

function getCriticalPath(buildCtx: d.BuildCtx) {
  const componentGraph = buildCtx.componentGraph;
  if (!buildCtx.indexDoc || !componentGraph) {
    return [];
  }
  return unique(
    flatOne(
      getUsedComponents(buildCtx.indexDoc, buildCtx.components)
        .map(tagName => getScopeId(tagName))
        .map(scopeId => buildCtx.componentGraph.get(scopeId) || [])
    )
  ).sort();
}

async function generateWww(config: d.Config, compilerCtx: d.CompilerCtx, buildCtx: d.BuildCtx, criticalPath: string[], outputTarget: d.OutputTargetWww) {
  // Copy assets into www
  performCopyTasks(config, compilerCtx, buildCtx,
    await processCopyTasks(config, outputTarget.dir, outputTarget.copy),
  );
  if (!config.buildEs5) {
    await generateEs5DisabledMessage(config, compilerCtx, outputTarget);
  }

  // Copy global styles into the build directory
  const globalStylesFilename = await writeGlobalStyles(config, compilerCtx, buildCtx, outputTarget.buildDir);

  // Process
  if (buildCtx.indexDoc && outputTarget.indexHtml) {
    await generateIndexHtml(config, compilerCtx, buildCtx, criticalPath, globalStylesFilename, outputTarget);
  }
  await generateHostConfig(config, compilerCtx, outputTarget);
}

function generateHostConfig(config: d.Config, compilerCtx: d.CompilerCtx, outputTarget: d.OutputTargetWww) {
  const buildDir = normalizePath(config.sys.path.relative(outputTarget.dir, outputTarget.buildDir));
  const hostConfigPath = config.sys.path.join(outputTarget.dir, 'host.config.json');
  const hostConfigContent = JSON.stringify({
    'hosting': {
      'headers': [
        {
          'source': `/${buildDir}/p-*`,
          'headers': [ {
            'key': 'Cache-Control',
            'value': 'max-age=365000000, immutable'
          } ]
        }
      ]
    }
  }, null, '  ');

  return compilerCtx.fs.writeFile(hostConfigPath, hostConfigContent);
}

async function generateIndexHtml(config: d.Config, compilerCtx: d.CompilerCtx, buildCtx: d.BuildCtx, criticalPath: string[], globalStylesFilename: string, outputTarget: d.OutputTargetWww) {
  if (compilerCtx.hasSuccessfulBuild && !buildCtx.hasIndexHtmlChanges) {
    // no need to rebuild index.html if there were no app file changes
    return;
  }

  // get the source index html content
  try {
    const doc = config.sys.cloneDocument(buildCtx.indexDoc);

    // validateHtml(config, buildCtx, doc);
    await updateIndexHtmlServiceWorker(config, buildCtx, doc, outputTarget);
    if (!config.watch && !config.devMode) {
      await inlineEsmImport(config, compilerCtx, doc, outputTarget);
      await inlineStyleSheets(config, compilerCtx, doc, MAX_CSS_INLINE_SIZE, outputTarget);
      updateGlobalStylesLink(config, doc, globalStylesFilename, outputTarget);
      optimizeCriticalPath(config, doc, criticalPath, outputTarget);
    }

    const indexContent = config.sys.serializeNodeToHtml(doc);
    await compilerCtx.fs.writeFile(outputTarget.indexHtml, indexContent);
    if (outputTarget.serviceWorker) {
      await compilerCtx.fs.writeFile(config.sys.path.join(outputTarget.dir, INDEX_ORG), indexContent);
    }

    buildCtx.debug(`generateIndexHtml, write: ${config.sys.path.relative(config.rootDir, outputTarget.indexHtml)}`);

  } catch (e) {
    catchError(buildCtx.diagnostics, e);
  }
}

const MAX_CSS_INLINE_SIZE = 3 * 1024;
